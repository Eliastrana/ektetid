import type { Profile } from '@/lib/database.types';
import type { AlbumCoverLayout } from '@/lib/album-customization';
import { signedUrls } from '@/lib/images';
import { supabase } from '@/lib/supabase';

const BUCKET = 'photos';

export type AdminPost = {
  id: string;
  position: number;
  title: string | null;
  takenAt: string;
  imagePath: string;
  selfiePath: string | null;
  videoPath: string | null;
  imageUrl: string | null;
  videoUrl: string | null;
  blurhash: string | null;
  author: Pick<Profile, 'id' | 'username' | 'display_name' | 'avatar_url'>;
};

export type AlbumAdmin = {
  id: string;
  title: string;
  description: string | null;
  coverPostId: string | null;
  accentColor: string;
  coverLayout: AlbumCoverLayout;
  ownerId: string;
  isOwner: boolean;
  members: Pick<Profile, 'id' | 'username' | 'display_name' | 'avatar_url'>[];
  posts: AdminPost[];
};

/** Everything the management screen needs, in one round trip per concern. */
export async function fetchAlbumAdmin(albumId: string, selfId: string): Promise<AlbumAdmin> {
  const [album, posts, members] = await Promise.all([
    supabase
      .from('albums')
      .select('id, title, description, owner_id, cover_post_id, accent_color, cover_layout')
      .eq('id', albumId)
      .single(),
    supabase
      .from('posts')
      // Written as one literal: PostgREST's types are inferred from the
      // string, and a concatenation is opaque to that inference.
      .select(
        'id, position, title, taken_at, image_path, selfie_path, video_path, blurhash, author:profiles!posts_author_id_fkey(id, username, display_name, avatar_url)'
      )
      .eq('album_id', albumId)
      .order('position'),
    supabase
      .from('album_members')
      .select('member:profiles!album_members_user_id_fkey(id, username, display_name, avatar_url)')
      .eq('album_id', albumId),
  ]);

  if (album.error) throw album.error;
  if (posts.error) throw posts.error;

  const paths = posts.data.flatMap((post) =>
    [post.image_path, post.video_path].filter((path): path is string => !!path)
  );
  const urls = paths.length ? await signedUrls(paths) : new Map<string, string>();

  return {
    id: album.data.id,
    title: album.data.title,
    description: album.data.description,
    coverPostId: album.data.cover_post_id,
    accentColor: album.data.accent_color,
    coverLayout: album.data.cover_layout as AlbumCoverLayout,
    ownerId: album.data.owner_id,
    isOwner: album.data.owner_id === selfId,
    members: (members.data ?? []).map((row) => row.member as unknown as AlbumAdmin['members'][0]),
    posts: posts.data.map((post) => ({
      id: post.id,
      position: post.position,
      title: post.title,
      takenAt: post.taken_at,
      imagePath: post.image_path,
      selfiePath: post.selfie_path,
      videoPath: post.video_path,
      imageUrl: urls.get(post.image_path) ?? null,
      videoUrl: post.video_path ? (urls.get(post.video_path) ?? null) : null,
      blurhash: post.blurhash,
      author: post.author as unknown as AdminPost['author'],
    })),
  };
}

export async function updateAlbum(
  albumId: string,
  fields: { title?: string; description?: string | null }
): Promise<void> {
  const { error } = await supabase.from('albums').update(fields).eq('id', albumId);
  if (error) throw error;
}

export async function updateAlbumCustomization(
  albumId: string,
  fields: {
    coverPostId: string | null;
    accentColor: string;
    coverLayout: AlbumCoverLayout;
  }
): Promise<void> {
  const { error } = await supabase.rpc('update_album_customization', {
    p_album_id: albumId,
    p_cover_post_id: fields.coverPostId,
    p_accent_color: fields.accentColor,
    p_cover_layout: fields.coverLayout,
  });
  if (error) throw error;
}

/**
 * Delete a post and the files behind it.
 *
 * The row goes first: if the storage removal fails we are left with
 * unreferenced bytes, which is untidy but harmless. The other order would
 * leave a post pointing at a photo that no longer exists.
 */
export async function deletePost(post: {
  id: string;
  imagePath: string;
  selfiePath: string | null;
}): Promise<void> {
  const { error } = await supabase.from('posts').delete().eq('id', post.id);
  if (error) throw error;

  await supabase.storage
    .from(BUCKET)
    .remove([post.imagePath, ...(post.selfiePath ? [post.selfiePath] : [])]);
}

/** Persist a new order. Positions are unique per album, so this goes through the RPC. */
export async function reorderAlbum(albumId: string, postIds: string[]): Promise<void> {
  const { error } = await supabase.rpc('reorder_album', {
    p_album_id: albumId,
    p_post_ids: postIds,
  });
  if (error) throw error;
}

/** Friends who are not already collaborating on this album. */
export async function listInvitableFriends(
  albumId: string,
  selfId: string
): Promise<Pick<Profile, 'id' | 'username' | 'display_name' | 'avatar_url'>[]> {
  const [friendships, members, album] = await Promise.all([
    supabase
      .from('friendships')
      .select(
        'requester_id, addressee_id, requester:profiles!friendships_requester_id_fkey(id, username, display_name, avatar_url), addressee:profiles!friendships_addressee_id_fkey(id, username, display_name, avatar_url)'
      )
      .eq('status', 'accepted'),
    supabase.from('album_members').select('user_id').eq('album_id', albumId),
    supabase.from('albums').select('owner_id').eq('id', albumId).single(),
  ]);

  if (friendships.error) throw friendships.error;

  const taken = new Set<string>([
    ...(members.data ?? []).map((m) => m.user_id),
    album.data?.owner_id ?? '',
  ]);

  return friendships.data
    .map((row) =>
      (row.requester_id === selfId
        ? row.addressee
        : row.requester) as unknown as Pick<Profile, 'id' | 'username' | 'display_name' | 'avatar_url'>
    )
    .filter((profile) => profile && !taken.has(profile.id));
}

export async function addMember(
  albumId: string,
  userId: string,
  selfId: string
): Promise<void> {
  const { error } = await supabase
    .from('album_members')
    .insert({ album_id: albumId, user_id: userId, added_by: selfId });
  if (error) throw error;
}

export async function removeMember(albumId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('album_members')
    .delete()
    .eq('album_id', albumId)
    .eq('user_id', userId);
  if (error) throw error;
}

export async function deleteAlbum(albumId: string): Promise<void> {
  // Posts cascade, but their files do not, so collect the paths first.
  const { data: posts } = await supabase
    .from('posts')
    .select('image_path, selfie_path')
    .eq('album_id', albumId);

  const { error } = await supabase.from('albums').delete().eq('id', albumId);
  if (error) throw error;

  const paths = (posts ?? []).flatMap((p) =>
    [p.image_path, p.selfie_path].filter((v): v is string => !!v)
  );
  if (paths.length) await supabase.storage.from(BUCKET).remove(paths);
}
