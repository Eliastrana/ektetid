import type { FriendshipStatus, Profile } from '@/lib/database.types';
import { signedUrls } from '@/lib/images';
import { supabase } from '@/lib/supabase';
import type { OwnAlbum } from '@/lib/profile';
import { hasPro } from '@/lib/social';

export type Relationship =
  | { kind: 'self' }
  | { kind: 'none' }
  | { kind: 'pending'; outgoing: boolean }
  | { kind: 'accepted' }
  | { kind: 'blocked' };

export type PublicProfile = {
  profile: Profile;
  relationship: Relationship;
  /**
   * Counts of what the *caller* can see. For a friend that is everything they
   * have posted; for a stranger it is zero, because RLS hides the rows. There
   * is deliberately no friend count: friendship edges are only visible to the
   * two people in them, so we genuinely cannot know someone else's.
   */
  albums: number;
  posts: number;
  heartsReceived: number;
  visibleAlbums: OwnAlbum[];
  isPro: boolean;
};

export async function fetchPublicProfile(
  userId: string,
  selfId: string
): Promise<PublicProfile | null> {
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (error) throw error;
  // Either no such user, or a block hides them from us — the profiles policy
  // makes those indistinguishable on purpose.
  if (!profile) return null;

  const [edge, albumRows, postCount, hearts, isPro] = await Promise.all([
    supabase
      .from('friendships')
      .select('requester_id, addressee_id, status')
      .or(
        `and(requester_id.eq.${selfId},addressee_id.eq.${userId}),` +
          `and(requester_id.eq.${userId},addressee_id.eq.${selfId})`
      )
      .maybeSingle(),
    supabase.from('album_feed').select('*').eq('owner_id', userId).order('updated_at', {
      ascending: false,
    }),
    supabase.from('posts').select('id', { count: 'exact', head: true }).eq('author_id', userId),
    supabase
      .from('likes')
      .select('post_id, posts!inner(author_id)', { count: 'exact', head: true })
      .eq('posts.author_id', userId),
    hasPro(userId),
  ]);

  const albums = albumRows.data ?? [];
  const paths = albums
    .map((album) => album.cover_image_path)
    .filter((path): path is string => !!path);
  const urls = paths.length ? await signedUrls(paths) : new Map<string, string>();

  return {
    profile,
    relationship: toRelationship(edge.data, selfId, userId),
    albums: albums.length,
    posts: postCount.count ?? 0,
    heartsReceived: hearts.count ?? 0,
    visibleAlbums: albums.map((album) => ({
      ...album,
      coverUrl: album.cover_image_path ? (urls.get(album.cover_image_path) ?? null) : null,
    })),
    isPro,
  };
}

function toRelationship(
  edge: { requester_id: string; addressee_id: string; status: FriendshipStatus } | null,
  selfId: string,
  userId: string
): Relationship {
  if (selfId === userId) return { kind: 'self' };
  if (!edge) return { kind: 'none' };
  if (edge.status === 'accepted') return { kind: 'accepted' };
  if (edge.status === 'blocked') return { kind: 'blocked' };
  return { kind: 'pending', outgoing: edge.requester_id === selfId };
}
