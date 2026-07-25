import type { Post } from '@/lib/database.types';
import { signedUrls } from '@/lib/images';
import { supabase } from '@/lib/supabase';

export type AlbumPost = Post & {
  imageUrl: string | null;
  selfieUrl: string | null;
};

export type AlbumDetail = {
  id: string;
  title: string;
  description: string | null;
  ownerId: string;
  posts: AlbumPost[];
  lastSeenPosition: number;
};

/**
 * Load a whole album at once.
 *
 * The web app paged through Sanity two images at a time because each fetch was
 * a network round-trip for the document. Here the rows are small — only the
 * image bytes are heavy, and those load lazily through expo-image — so one
 * query is both simpler and faster.
 */
export async function fetchAlbum(albumId: string): Promise<AlbumDetail> {
  const [albumResult, postsResult, readResult] = await Promise.all([
    supabase.from('albums').select('id, title, description, owner_id').eq('id', albumId).single(),
    supabase.from('posts').select('*').eq('album_id', albumId).order('position'),
    supabase.from('album_reads').select('last_seen_position').eq('album_id', albumId).maybeSingle(),
  ]);

  if (albumResult.error) throw albumResult.error;
  if (postsResult.error) throw postsResult.error;

  const paths = postsResult.data.flatMap((post) =>
    [post.image_path, post.selfie_path].filter((path): path is string => !!path)
  );
  const urls = paths.length ? await signedUrls(paths) : new Map<string, string>();

  return {
    id: albumResult.data.id,
    title: albumResult.data.title,
    description: albumResult.data.description,
    ownerId: albumResult.data.owner_id,
    lastSeenPosition: readResult.data?.last_seen_position ?? -1,
    posts: postsResult.data.map((post) => ({
      ...post,
      imageUrl: urls.get(post.image_path) ?? null,
      selfieUrl: post.selfie_path ? (urls.get(post.selfie_path) ?? null) : null,
    })),
  };
}

/**
 * Record how far the user has read. Only ever moves forward, so re-reading an
 * old album does not resurrect the unseen badge.
 */
export async function markAlbumRead(
  userId: string,
  albumId: string,
  position: number
): Promise<void> {
  const { data } = await supabase
    .from('album_reads')
    .select('last_seen_position')
    .eq('album_id', albumId)
    .maybeSingle();

  if (data && data.last_seen_position >= position) return;

  await supabase
    .from('album_reads')
    .upsert(
      { user_id: userId, album_id: albumId, last_seen_position: position },
      { onConflict: 'user_id,album_id' }
    );
}
