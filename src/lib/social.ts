import type { Comment, Profile } from '@/lib/database.types';
import { notify } from '@/lib/notifications';
import { supabase } from '@/lib/supabase';

export type CommentWithAuthor = Comment & {
  author: Pick<Profile, 'username' | 'avatar_url'>;
  likeCount: number;
  likedByMe: boolean;
};

export type SocialProfile = Pick<Profile, 'id' | 'username' | 'display_name' | 'avatar_url'>;

export type Liker = {
  created_at: string;
  user: SocialProfile;
};

export type PostViewer = {
  first_seen_at: string;
  last_seen_at: string;
  view_count: number;
  viewer: SocialProfile;
};

// ---------------------------------------------------------------------------
// likes
//
// The web app kept a `hearts` integer on the document and remembered "did I
// like this" in localStorage, so the count drifted and a cleared browser
// re-enabled liking. One row per user per post makes both server truth.
// ---------------------------------------------------------------------------

export type LikeState = { count: number; likedByMe: boolean };

export async function fetchLikes(postId: string, selfId: string): Promise<LikeState> {
  const [{ count }, mine] = await Promise.all([
    supabase.from('likes').select('*', { count: 'exact', head: true }).eq('post_id', postId),
    supabase.from('likes').select('post_id').eq('post_id', postId).eq('user_id', selfId).maybeSingle(),
  ]);

  return { count: count ?? 0, likedByMe: !!mine.data };
}

/** Hearts and comment counts for a whole screen of posts. */
export type PostSocialCounts = {
  likes: number;
  likedByMe: boolean;
  comments: number;
};

/**
 * Social counts for many posts at once.
 *
 * Three queries for the whole feed rather than three per post: a stream of
 * eighty would otherwise open two hundred and forty round trips to draw a row
 * of hearts. Rows are counted here instead of asking Postgres for a count per
 * post, since PostgREST has no grouped count and the ids are already in hand.
 */
export async function fetchPostSocialCounts(
  postIds: string[],
  selfId: string
): Promise<Map<string, PostSocialCounts>> {
  const counts = new Map<string, PostSocialCounts>();
  if (postIds.length === 0) return counts;

  for (const id of postIds) counts.set(id, { likes: 0, likedByMe: false, comments: 0 });

  const [likes, mine, comments] = await Promise.all([
    supabase.from('likes').select('post_id').in('post_id', postIds),
    supabase.from('likes').select('post_id').in('post_id', postIds).eq('user_id', selfId),
    supabase.from('comments').select('post_id').in('post_id', postIds),
  ]);

  for (const row of likes.data ?? []) {
    const entry = counts.get(row.post_id);
    if (entry) entry.likes += 1;
  }
  for (const row of mine.data ?? []) {
    const entry = counts.get(row.post_id);
    if (entry) entry.likedByMe = true;
  }
  for (const row of comments.data ?? []) {
    const entry = counts.get(row.post_id);
    if (entry) entry.comments += 1;
  }

  return counts;
}

export async function fetchLikers(postId: string): Promise<Liker[]> {
  const { data, error } = await supabase
    .from('likes')
    .select(
      'created_at, user:profiles!likes_user_id_fkey(id, username, display_name, avatar_url)'
    )
    .eq('post_id', postId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as unknown as Liker[];
}

export async function recordPostView(postId: string): Promise<void> {
  const { error } = await supabase.rpc('record_post_view', { p_post_id: postId });
  if (error) throw error;
}

export async function fetchPostViewers(postId: string): Promise<PostViewer[]> {
  const { data, error } = await supabase
    .from('post_views')
    .select(
      'first_seen_at, last_seen_at, view_count, viewer:profiles!post_views_viewer_id_fkey(id, username, display_name, avatar_url)'
    )
    .eq('post_id', postId)
    .order('last_seen_at', { ascending: false });
  if (error) throw error;
  return data as unknown as PostViewer[];
}

export async function hasPro(userId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('has_pro', { who: userId });
  if (error) throw error;
  return data;
}

/** Toggle a like. Returns the new state so callers can reconcile after an optimistic update. */
export async function toggleLike(
  postId: string,
  selfId: string,
  currentlyLiked: boolean
): Promise<void> {
  if (currentlyLiked) {
    const { error } = await supabase
      .from('likes')
      .delete()
      .eq('post_id', postId)
      .eq('user_id', selfId);
    if (error) throw error;
    return;
  }

  const { error } = await supabase.from('likes').insert({ post_id: postId, user_id: selfId });
  // A duplicate just means a double-tap raced; the desired state already holds.
  if (error && error.code !== '23505') throw error;

  /*
   * Announced after the insert, never before.
   *
   * The server confirms the like actually exists before it will send anything,
   * so announcing it first is a guaranteed rejection. Skipped entirely on a
   * duplicate: unliking and liking again would otherwise let someone ring the
   * same person's phone as often as they liked.
   */
  if (!error) notify('like', postId);
}

// ---------------------------------------------------------------------------
// comments
// ---------------------------------------------------------------------------

export async function fetchComments(
  postId: string,
  selfId?: string
): Promise<CommentWithAuthor[]> {
  const { data, error } = await supabase
    .from('comments')
    .select('*, author:profiles!comments_author_id_fkey(username, avatar_url)')
    .eq('post_id', postId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  const comments = data as unknown as (Comment & {
    author: Pick<Profile, 'username' | 'avatar_url'>;
  })[];
  const ids = comments.map((comment) => comment.id);
  if (!ids.length) return [];

  const likes = await supabase
    .from('comment_likes')
    .select('comment_id, user_id')
    .in('comment_id', ids);
  if (likes.error) throw likes.error;

  const counts = new Map<string, number>();
  const mine = new Set<string>();
  for (const like of likes.data) {
    counts.set(like.comment_id, (counts.get(like.comment_id) ?? 0) + 1);
    if (selfId && like.user_id === selfId) mine.add(like.comment_id);
  }

  const enriched = comments.map((comment) => ({
    ...comment,
    likeCount: counts.get(comment.id) ?? 0,
    likedByMe: mine.has(comment.id),
  }));

  const roots = enriched.filter((comment) => !comment.parent_comment_id);
  const replies = enriched.filter((comment) => !!comment.parent_comment_id);
  return roots.flatMap((root) => [
    root,
    ...replies
      .filter((reply) => reply.parent_comment_id === root.id)
      .sort((a, b) => a.created_at.localeCompare(b.created_at)),
  ]);
}

export async function addComment(
  postId: string,
  selfId: string,
  body: string,
  parentCommentId?: string | null
): Promise<void> {
  const { data, error } = await supabase
    .from('comments')
    .insert({
      post_id: postId,
      author_id: selfId,
      body: body.trim(),
      parent_comment_id: parentCommentId ?? null,
    })
    .select('id')
    .single();
  if (error) throw error;
  notify('comment', data.id);
}

export async function toggleCommentLike(
  commentId: string,
  selfId: string,
  currentlyLiked: boolean
): Promise<void> {
  const query = supabase.from('comment_likes');
  const { error } = currentlyLiked
    ? await query.delete().eq('comment_id', commentId).eq('user_id', selfId)
    : await query.insert({ comment_id: commentId, user_id: selfId });
  if (error && error.code !== '23505') throw error;
}

export async function deleteComment(commentId: string): Promise<void> {
  const { error } = await supabase.from('comments').delete().eq('id', commentId);
  if (error) throw error;
}

/**
 * Subscribe to new comments on a post.
 *
 * Replaces Firestore's onSnapshot. The stream is RLS-filtered server-side, so
 * a user never receives comments on a post they cannot see. Returns an
 * unsubscribe function.
 */
export function subscribeToComments(postId: string, onChange: () => void): () => void {
  const channel = supabase
    .channel(`comments:${postId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'comments', filter: `post_id=eq.${postId}` },
      onChange
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'comment_likes' },
      onChange
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}
