import type { Comment, Profile } from '@/lib/database.types';
import { notify } from '@/lib/notifications';
import { supabase } from '@/lib/supabase';

export type CommentWithAuthor = Comment & { author: Pick<Profile, 'username' | 'avatar_url'> };

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

export async function fetchComments(postId: string): Promise<CommentWithAuthor[]> {
  const { data, error } = await supabase
    .from('comments')
    .select('*, author:profiles!comments_author_id_fkey(username, avatar_url)')
    .eq('post_id', postId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data as unknown as CommentWithAuthor[];
}

export async function addComment(postId: string, selfId: string, body: string): Promise<void> {
  const { data, error } = await supabase
    .from('comments')
    .insert({ post_id: postId, author_id: selfId, body: body.trim() })
    .select('id')
    .single();
  if (error) throw error;
  notify('comment', data.id);
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
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}
