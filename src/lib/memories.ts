import { signedUrls } from '@/lib/images';
import { supabase } from '@/lib/supabase';

export type MemoryPost = {
  id: string;
  albumId: string;
  albumTitle: string;
  title: string | null;
  description: string | null;
  takenAt: string;
  imageUrl: string | null;
  blurhash: string | null;
};

export type MemoryGroup = {
  key: string;
  label: string;
  detail: string;
  posts: MemoryPost[];
};

/** The RPC checks Pro and only returns posts authored by the signed-in user. */
export async function fetchMemories(): Promise<MemoryPost[]> {
  const { data, error } = await supabase.rpc('pro_memories');
  if (error) throw error;

  const rows = data as unknown as {
    id: string;
    album_id: string;
    album_title: string;
    title: string | null;
    description: string | null;
    taken_at: string;
    image_path: string;
    blurhash: string | null;
  }[];
  const urls = rows.length
    ? await signedUrls(rows.map((post) => post.image_path))
    : new Map<string, string>();

  return rows.map((post) => ({
    id: post.id,
    albumId: post.album_id,
    albumTitle: post.album_title,
    title: post.title,
    description: post.description,
    takenAt: post.taken_at,
    imageUrl: urls.get(post.image_path) ?? null,
    blurhash: post.blurhash,
  }));
}

export function memoriesOnThisDay(posts: MemoryPost[], now = new Date()): MemoryPost[] {
  return posts.filter((post) => {
    const date = new Date(post.takenAt);
    return (
      date.getFullYear() < now.getFullYear() &&
      date.getMonth() === now.getMonth() &&
      date.getDate() === now.getDate()
    );
  });
}

function capitalize(label: string): string {
  return label.charAt(0).toLocaleUpperCase('nb-NO') + label.slice(1);
}

export function groupMemories(
  posts: MemoryPost[],
  period: 'month' | 'year'
): MemoryGroup[] {
  const groups = new Map<string, MemoryPost[]>();

  for (const post of posts) {
    const date = new Date(post.takenAt);
    const key =
      period === 'month'
        ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
        : String(date.getFullYear());
    groups.set(key, [...(groups.get(key) ?? []), post]);
  }

  return [...groups.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([key, groupedPosts]) => {
      const date = new Date(groupedPosts[0].takenAt);
      return {
        key,
        label:
          period === 'month'
            ? capitalize(
                new Intl.DateTimeFormat('nb-NO', { month: 'long', year: 'numeric' }).format(date)
              )
            : String(date.getFullYear()),
        detail: `${groupedPosts.length} ${groupedPosts.length === 1 ? 'øyeblikk' : 'øyeblikk'}`,
        posts: groupedPosts,
      };
    });
}
