import type { Post } from '@/lib/database.types';
import { signedUrls } from '@/lib/images';
import { hasPro } from '@/lib/social';
import { supabase } from '@/lib/supabase';

type FeedAuthor = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
};

export type PostFeedItem = Pick<
  Post,
  | 'id'
  | 'album_id'
  | 'title'
  | 'description'
  | 'location'
  | 'taken_at'
  | 'image_path'
  | 'blurhash'
  | 'rating'
  | 'video_path'
> & {
  imageUrl: string;
  author: FeedAuthor;
  authorHasPro: boolean;
  album: { id: string; title: string };
};

/** Newest visible posts for the dedicated vertical stream. RLS supplies privacy. */
export async function fetchPostFeed(): Promise<PostFeedItem[]> {
  const { data, error } = await supabase
    .from('posts')
    .select(
      'id, album_id, title, description, location, taken_at, image_path, blurhash, rating, video_path, author:profiles!posts_author_id_fkey(id, username, display_name, avatar_url), album:albums!posts_album_id_fkey(id, title)'
    )
    .order('created_at', { ascending: false })
    .limit(80);

  if (error) throw error;

  const paths = data.map((post) => post.image_path);
  const urls = paths.length ? await signedUrls(paths) : new Map<string, string>();
  const authorIds = [...new Set(data.map((post) => post.author?.id).filter(Boolean))] as string[];
  const statuses = new Map(
    await Promise.all(
      authorIds.map(async (userId) => [userId, await hasPro(userId)] as const)
    )
  );

  return data.flatMap((post) => {
    const imageUrl = urls.get(post.image_path);
    if (!imageUrl || !post.author || !post.album) return [];
    return [
      {
        ...post,
        imageUrl,
        author: post.author as FeedAuthor,
        album: post.album as { id: string; title: string },
        authorHasPro: statuses.get(post.author.id) ?? false,
      },
    ];
  });
}
