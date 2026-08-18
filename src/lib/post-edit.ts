import type { Post } from '@/lib/database.types';
import { supabase } from '@/lib/supabase';

export type EditablePost = Pick<
  Post,
  'id' | 'author_id' | 'title' | 'description' | 'location' | 'rating' | 'filter_name'
>;

export async function fetchEditablePost(postId: string): Promise<EditablePost> {
  const { data, error } = await supabase
    .from('posts')
    .select('id, author_id, title, description, location, rating, filter_name')
    .eq('id', postId)
    .single();
  if (error) throw error;
  return data;
}

export async function updatePostDetails(
  postId: string,
  input: Pick<EditablePost, 'title' | 'description' | 'location' | 'rating'>
): Promise<void> {
  const { error } = await supabase
    .from('posts')
    .update({
      title: input.title?.trim() || null,
      description: input.description?.trim() || null,
      location: input.location?.trim() || null,
      rating: input.rating,
    })
    .eq('id', postId);
  if (error) throw error;
}
