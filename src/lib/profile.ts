import { signedUrls } from '@/lib/images';
import { supabase } from '@/lib/supabase';
import type { AlbumFeedRow } from '@/lib/database.types';

export type ProfileStats = {
  albums: number;
  posts: number;
  friends: number;
  /** Hearts received across everything this user has posted. */
  heartsReceived: number;
};

export type OwnAlbum = AlbumFeedRow & { coverUrl: string | null };

/**
 * Counts for the profile header.
 *
 * All four run as head-only count queries — the numbers are all that is shown,
 * so there is no reason to pull the rows across.
 */
export async function fetchProfileStats(userId: string): Promise<ProfileStats> {
  const [albums, posts, friends, hearts] = await Promise.all([
    supabase.from('albums').select('id', { count: 'exact', head: true }).eq('owner_id', userId),
    supabase.from('posts').select('id', { count: 'exact', head: true }).eq('author_id', userId),
    supabase
      .from('friendships')
      .select('requester_id', { count: 'exact', head: true })
      .eq('status', 'accepted'),
    // Hearts on my posts, via an inner join so the filter applies to the post's
    // author rather than to the liker.
    supabase
      .from('likes')
      .select('post_id, posts!inner(author_id)', { count: 'exact', head: true })
      .eq('posts.author_id', userId),
  ]);

  return {
    albums: albums.count ?? 0,
    posts: posts.count ?? 0,
    // friendships RLS only returns edges involving the caller, so every
    // accepted row it can see is one of this user's friendships.
    friends: friends.count ?? 0,
    heartsReceived: hearts.count ?? 0,
  };
}

/** The signed-in user's own albums, newest activity first. */
export async function fetchOwnAlbums(userId: string): Promise<OwnAlbum[]> {
  const { data, error } = await supabase
    .from('album_feed')
    .select('*')
    .eq('owner_id', userId)
    .order('updated_at', { ascending: false });

  if (error) throw error;

  const paths = data
    .map((album) => album.cover_image_path)
    .filter((path): path is string => !!path);
  const urls = paths.length ? await signedUrls(paths) : new Map<string, string>();

  return data.map((album) => ({
    ...album,
    coverUrl: album.cover_image_path ? (urls.get(album.cover_image_path) ?? null) : null,
  }));
}
