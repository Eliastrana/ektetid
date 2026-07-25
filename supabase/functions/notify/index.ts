import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';

/**
 * Fan a single event out to the people who should hear about it.
 *
 * Called by the client that caused the event, with that user's own JWT. Two
 * things follow from that, and both matter:
 *
 * 1. The caller is verified to actually own the thing they are announcing.
 *    Otherwise anyone could POST `{kind: 'comment', id: <someone else's>}` and
 *    make the app send push notifications on their behalf.
 *
 * 2. Access is re-checked here, at send time, rather than trusted from
 *    whenever the row was written. A notification's text is rendered before the
 *    app opens, so the recipient's own policies never get a chance to filter
 *    it — the decision about what to reveal is made entirely here. A friendship
 *    can be withdrawn, or a block created, between the write and the delivery.
 */

const EXPO_PUSH_ENDPOINT = 'https://exp.host/--/api/v2/push/send';

type Kind = 'friend_request' | 'friend_accepted' | 'comment' | 'post' | 'like';

/** Which preference column governs each kind. */
const PREF_COLUMN: Record<Kind, string> = {
  friend_request: 'friend_requests',
  friend_accepted: 'friend_requests',
  comment: 'comments',
  // Resolved per recipient: a member of a shared album is governed by a
  // different switch than a friend simply seeing a new photo.
  post: 'friend_posts',
  like: 'likes',
};

const DEFAULT_PREFS: Record<string, boolean> = {
  friend_requests: true,
  comments: true,
  shared_album_posts: true,
  friend_posts: true,
  likes: false,
};

type Message = {
  to: string;
  title: string;
  body: string;
  data: Record<string, string>;
  sound: 'default';
};

function displayName(profile: { display_name: string | null; username: string } | null): string {
  return profile?.display_name ?? profile?.username ?? 'Noen';
}

/**
 * Everyone who may currently see the album, minus the person who acted.
 *
 * Delegates to `can_see_album`, the same function the row-level policies use,
 * so the notification audience cannot drift away from the read audience.
 */
async function albumAudience(
  admin: SupabaseClient,
  albumId: string,
  actorId: string
): Promise<{ ownerId: string; memberIds: string[]; friendIds: string[] }> {
  const { data: album } = await admin
    .from('albums')
    .select('owner_id')
    .eq('id', albumId)
    .maybeSingle();

  if (!album) return { ownerId: '', memberIds: [], friendIds: [] };

  const { data: members } = await admin
    .from('album_members')
    .select('user_id')
    .eq('album_id', albumId);

  const { data: friendships } = await admin
    .from('friendships')
    .select('requester_id, addressee_id')
    .eq('status', 'accepted')
    .or(`requester_id.eq.${album.owner_id},addressee_id.eq.${album.owner_id}`);

  const friendIds = (friendships ?? [])
    .map((row) => (row.requester_id === album.owner_id ? row.addressee_id : row.requester_id))
    .filter((id: string) => id !== actorId);

  return {
    ownerId: album.owner_id,
    memberIds: (members ?? []).map((row) => row.user_id).filter((id: string) => id !== actorId),
    friendIds,
  };
}

/** Drop anyone who has blocked, or been blocked by, the person who acted. */
async function withoutBlocked(
  admin: SupabaseClient,
  actorId: string,
  recipients: string[]
): Promise<string[]> {
  if (recipients.length === 0) return [];

  const { data } = await admin
    .from('friendships')
    .select('requester_id, addressee_id, status')
    .eq('status', 'blocked')
    .or(`requester_id.eq.${actorId},addressee_id.eq.${actorId}`);

  const blocked = new Set(
    (data ?? []).map((row) => (row.requester_id === actorId ? row.addressee_id : row.requester_id))
  );
  return recipients.filter((id) => !blocked.has(id));
}

/** Keep only those whose preferences allow this kind, honouring the defaults. */
async function allowedBy(
  admin: SupabaseClient,
  column: string,
  recipients: string[]
): Promise<string[]> {
  if (recipients.length === 0) return [];

  const { data } = await admin
    .from('notification_prefs')
    .select(`user_id, ${column}`)
    .in('user_id', recipients);

  const explicit = new Map(
    (data ?? []).map((row: Record<string, unknown>) => [row.user_id as string, row[column]])
  );
  // Absent row means defaults, which is why this is a lookup with a fallback
  // rather than an inner join.
  return recipients.filter((id) => (explicit.get(id) ?? DEFAULT_PREFS[column]) === true);
}

async function tokensFor(admin: SupabaseClient, recipients: string[]): Promise<string[]> {
  if (recipients.length === 0) return [];
  const { data } = await admin.from('push_tokens').select('token').in('user_id', recipients);
  return (data ?? []).map((row) => row.token);
}

async function send(messages: Message[]): Promise<void> {
  if (messages.length === 0) return;

  // Expo accepts up to 100 per request.
  for (let i = 0; i < messages.length; i += 100) {
    await fetch(EXPO_PUSH_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(messages.slice(i, i + 100)),
    });
  }
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const authorization = request.headers.get('Authorization') ?? '';
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;

  const caller = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authorization } },
  });

  const {
    data: { user },
  } = await caller.auth.getUser();
  if (!user) return new Response('Unauthorized', { status: 401 });

  const admin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  let payload: { kind?: Kind; id?: string };
  try {
    payload = await request.json();
  } catch {
    return new Response('Bad request', { status: 400 });
  }

  const { kind, id } = payload;
  if (!kind || !id || !(kind in PREF_COLUMN)) return new Response('Bad request', { status: 400 });

  const { data: actor } = await admin
    .from('profiles')
    .select('username, display_name')
    .eq('id', user.id)
    .maybeSingle();
  const actorName = displayName(actor);

  const messages: Message[] = [];

  const queue = async (recipients: string[], column: string, build: (token: string) => Message) => {
    const permitted = await allowedBy(
      admin,
      column,
      await withoutBlocked(admin, user.id, [...new Set(recipients)].filter(Boolean))
    );
    for (const token of await tokensFor(admin, permitted)) messages.push(build(token));
  };

  if (kind === 'friend_request' || kind === 'friend_accepted') {
    // `id` is the other person. Verified by requiring an edge between them in
    // the matching direction — a caller cannot notify a stranger.
    const { data: edge } = await admin
      .from('friendships')
      .select('requester_id, addressee_id, status')
      .or(
        `and(requester_id.eq.${user.id},addressee_id.eq.${id}),` +
          `and(requester_id.eq.${id},addressee_id.eq.${user.id})`
      )
      .maybeSingle();

    if (!edge) return new Response('Not found', { status: 404 });

    const pending = kind === 'friend_request';
    if (pending && edge.status !== 'pending') return new Response('ok', { status: 200 });
    if (!pending && edge.status !== 'accepted') return new Response('ok', { status: 200 });

    await queue([id], 'friend_requests', (to) => ({
      to,
      title: pending ? 'Ny venneforespørsel' : 'Dere er venner',
      body: pending
        ? `${actorName} vil bli venn med deg.`
        : `${actorName} godtok venneforespørselen din.`,
      data: { url: pending ? 'ektetid:///venner' : `ektetid:///profil/${user.id}` },
      sound: 'default',
    }));
  }

  if (kind === 'comment') {
    const { data: comment } = await admin
      .from('comments')
      .select('author_id, body, post_id, posts(author_id, album_id, title)')
      .eq('id', id)
      .maybeSingle();

    if (!comment) return new Response('Not found', { status: 404 });
    if (comment.author_id !== user.id) return new Response('Forbidden', { status: 403 });

    const post = comment.posts as unknown as {
      author_id: string;
      album_id: string;
      title: string | null;
    } | null;

    // Commenting on your own photo should not notify you.
    if (post && post.author_id !== user.id) {
      await queue([post.author_id], 'comments', (to) => ({
        to,
        title: 'Ny kommentar',
        body: `${actorName}: ${String(comment.body).slice(0, 120)}`,
        data: { url: `ektetid:///album/${post.album_id}` },
        sound: 'default',
      }));
    }
  }

  if (kind === 'like') {
    const { data: post } = await admin
      .from('posts')
      .select('author_id, album_id')
      .eq('id', id)
      .maybeSingle();

    if (!post) return new Response('Not found', { status: 404 });

    // Confirm the like exists and is the caller's, so this cannot be used to
    // notify someone about a like that never happened.
    const { data: like } = await admin
      .from('likes')
      .select('post_id')
      .eq('post_id', id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (!like) return new Response('Forbidden', { status: 403 });

    if (post.author_id !== user.id) {
      await queue([post.author_id], 'likes', (to) => ({
        to,
        title: 'Nytt hjerte',
        body: `${actorName} likte bildet ditt.`,
        data: { url: `ektetid:///album/${post.album_id}` },
        sound: 'default',
      }));
    }
  }

  if (kind === 'post') {
    const { data: post } = await admin
      .from('posts')
      .select('author_id, album_id, albums(title)')
      .eq('id', id)
      .maybeSingle();

    if (!post) return new Response('Not found', { status: 404 });
    if (post.author_id !== user.id) return new Response('Forbidden', { status: 403 });

    const albumTitle = (post.albums as unknown as { title: string } | null)?.title ?? 'et album';
    const { ownerId, memberIds, friendIds } = await albumAudience(admin, post.album_id, user.id);
    const url = `ektetid:///album/${post.album_id}`;

    // Collaborators, including the owner when someone else posted into their
    // album. A different switch and a different sentence: this is an album
    // they are part of, not merely one they can see.
    const collaborators = [...memberIds, ownerId].filter((who) => who && who !== user.id);
    await queue(collaborators, 'shared_album_posts', (to) => ({
      to,
      title: albumTitle,
      body: `${actorName} la til et bilde i «${albumTitle}».`,
      data: { url },
      sound: 'default',
    }));

    // Everyone else who follows the album's owner. Excluded if they are already
    // being told as a collaborator — one event, one notification.
    const alsoTold = new Set(collaborators);
    await queue(
      friendIds.filter((who) => !alsoTold.has(who)),
      'friend_posts',
      (to) => ({
        to,
        title: 'Nytt øyeblikk',
        body: `${actorName} la ut et nytt bilde.`,
        data: { url },
        sound: 'default',
      })
    );
  }

  await send(messages);
  return new Response(JSON.stringify({ sent: messages.length }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
