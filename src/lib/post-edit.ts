import type { Post } from '@/lib/database.types';
import { normaliseLink } from '@/lib/link';
import type { PostMusic } from '@/lib/music';
import type { PostVenue } from '@/lib/venue';
import { supabase } from '@/lib/supabase';

export type EditablePost = Pick<
  Post,
  | 'id'
  | 'author_id'
  | 'title'
  | 'description'
  | 'location'
  | 'rating'
  | 'filter_name'
  | 'music_track_id'
  | 'music_title'
  | 'music_artist'
  | 'music_artwork_url'
  | 'music_preview_url'
  | 'venue_name'
  | 'venue_category'
  | 'venue_address'
  | 'venue_latitude'
  | 'venue_longitude'
  | 'link'
>;

export async function fetchEditablePost(postId: string): Promise<EditablePost> {
  const { data, error } = await supabase
    .from('posts')
    // One literal, not a concatenation: PostgREST infers the row type from the
    // string itself, and a joined expression is opaque to that inference — the
    // result comes back typed as an error rather than as a post.
    .select(
      'id, author_id, title, description, location, rating, filter_name, music_track_id, music_title, music_artist, music_artwork_url, music_preview_url, venue_name, venue_category, venue_address, venue_latitude, venue_longitude, link'
    )
    .eq('id', postId)
    .single();
  if (error) throw error;
  return data;
}

export async function updatePostDetails(
  postId: string,
  input: Pick<EditablePost, 'title' | 'description' | 'location' | 'rating'> & {
    /** The whole set, so clearing the music writes five nulls rather than none. */
    music: PostMusic;
    /** Likewise: removing a venue has to write the nulls, not omit the keys. */
    venue: PostVenue;
    /** Raw as typed. Normalised here so the column constraint is never tested. */
    link: string;
  }
): Promise<void> {
  const { error } = await supabase
    .from('posts')
    .update({
      title: input.title?.trim() || null,
      description: input.description?.trim() || null,
      location: input.location?.trim() || null,
      rating: input.rating,
      ...input.music,
      ...input.venue,
      link: normaliseLink(input.link),
    })
    .eq('id', postId);
  if (error) throw error;
}
