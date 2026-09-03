/**
 * Track search, against Apple's iTunes Search API.
 *
 * Chosen because it needs no key, no account and no SDK, and returns a
 * thirty-second preview file we can play directly. Spotify cannot do this job:
 * its terms forbid synchronising their audio with visual media, `preview_url`
 * was closed to new applications in late 2024, and its SDK hands playback to
 * the Spotify app and requires Premium — none of which is a snippet under a
 * photograph.
 *
 * The previews are Apple's files, served from Apple's CDN and referenced by
 * URL. Nothing is copied into our Storage.
 */

import { supabase } from '@/lib/supabase';

const ENDPOINT = 'https://itunes.apple.com/search';

/**
 * Apple limits this endpoint to roughly twenty calls a minute per address.
 *
 * Not enforced here — the picker debounces instead, which is the only caller.
 * Recorded so the next caller knows there is a budget to respect.
 */
export const SEARCH_RATE_LIMIT_PER_MINUTE = 20;

const LIMIT = 20;

export type MusicTrack = {
  trackId: number;
  title: string;
  artist: string;
  artworkUrl: string | null;
  /** The thirty-second m4a. Tracks without one are dropped from results. */
  previewUrl: string;
};

/** What a post carries once a track is attached, mirroring the posts columns. */
export type PostMusic = {
  music_track_id: number | null;
  music_title: string | null;
  music_artist: string | null;
  music_artwork_url: string | null;
  music_preview_url: string | null;
};

export const NO_MUSIC: PostMusic = {
  music_track_id: null,
  music_title: null,
  music_artist: null,
  music_artwork_url: null,
  music_preview_url: null,
};

export function toPostMusic(track: MusicTrack): PostMusic {
  return {
    music_track_id: track.trackId,
    music_title: track.title,
    music_artist: track.artist,
    music_artwork_url: track.artworkUrl,
    music_preview_url: track.previewUrl,
  };
}

/**
 * Read a stored post's columns back as a track, or null when it has no music.
 *
 * The inverse of toPostMusic, so the editor can hand the same shape to the
 * picker that the composer does. A row missing its preview URL counts as no
 * music: there would be nothing to play.
 */
export function fromPostMusic(row: Partial<PostMusic>): MusicTrack | null {
  if (!row.music_preview_url || !row.music_title || !row.music_artist) return null;
  return {
    trackId: row.music_track_id ?? 0,
    title: row.music_title,
    artist: row.music_artist,
    artworkUrl: row.music_artwork_url ?? null,
    previewUrl: row.music_preview_url,
  };
}

/**
 * Artwork comes back at 100px, which is soft on any modern screen.
 *
 * The size is a path segment rather than a query parameter, and Apple serves
 * whatever is asked for, so this is the documented way to get a larger file.
 */
function upscaleArtwork(url: string | undefined, size: number): string | null {
  if (!url) return null;
  return url.replace(/\/(\d+)x(\d+)(bb)?\.(jpg|png)$/, `/${size}x${size}$3.$4`);
}

type RawResult = {
  trackId?: number;
  trackName?: string;
  artistName?: string;
  artworkUrl100?: string;
  previewUrl?: string;
};

/**
 * Search songs by name or artist.
 *
 * `country` matters: the catalogue and therefore the preview availability
 * differ by store, and asking the Norwegian one keeps results in line with what
 * the app's users can actually find.
 */
export async function searchMusic(
  term: string,
  options: { signal?: AbortSignal; country?: string } = {}
): Promise<MusicTrack[]> {
  const query = term.trim();
  if (!query) return [];

  const url =
    `${ENDPOINT}?media=music&entity=song&limit=${LIMIT}` +
    `&country=${options.country ?? 'NO'}&term=${encodeURIComponent(query)}`;

  const response = await fetch(url, { signal: options.signal });
  if (!response.ok) throw new Error(`Søket feilet (${response.status}).`);

  /*
   * Parsed from text rather than with response.json().
   *
   * This endpoint answers with `text/javascript` — a leftover from when it was
   * meant to be consumed as JSONP — and strict clients refuse to treat that as
   * JSON. The body itself is ordinary JSON.
   */
  const parsed = JSON.parse(await response.text()) as { results?: RawResult[] };

  return (parsed.results ?? [])
    .filter(
      (row): row is RawResult & { trackId: number; previewUrl: string } =>
        typeof row.trackId === 'number' && !!row.previewUrl
    )
    .map((row) => ({
      trackId: row.trackId,
      title: row.trackName ?? 'Ukjent tittel',
      artist: row.artistName ?? 'Ukjent artist',
      artworkUrl: upscaleArtwork(row.artworkUrl100, 200),
      previewUrl: row.previewUrl,
    }));
}

/**
 * Where the list shown before anyone types came from.
 *
 * `community` is what EkteTid's own users have been attaching; `chart` is
 * Apple's most-played for the country. The picker says which, because "popular
 * here" and "popular everywhere" are different claims and only one of them is
 * about the people you share albums with.
 */
export type SuggestionSource = 'community' | 'chart';

export type MusicSuggestions = {
  source: SuggestionSource;
  tracks: MusicTrack[];
};

/**
 * Fewer than this and the community list is not worth showing as one.
 *
 * Two or three entries under a heading claiming popularity reads as an empty
 * app rather than as a recommendation, and the chart is a better use of the
 * space until there is a real list to show.
 */
const MIN_COMMUNITY = 4;

/** Apple's most-played, which needs no key either. */
const CHART_ENDPOINT = 'https://rss.applemarketingtools.com/api/v2';

type ChartFeed = {
  feed?: { results?: { id?: string }[] };
};

/**
 * The country's most-played songs, resolved to playable previews.
 *
 * Two requests: the chart gives ids and names but no preview, so the ids go
 * back through lookup in one batch to pick up the audio and the artwork. Order
 * is restored from the chart afterwards — lookup does not promise to preserve
 * the order it was asked in, and the chart's order is the whole point.
 */
export async function fetchChartMusic(
  options: { signal?: AbortSignal; country?: string; limit?: number } = {}
): Promise<MusicTrack[]> {
  const country = options.country ?? 'no';
  const limit = options.limit ?? 12;

  const feedResponse = await fetch(
    `${CHART_ENDPOINT}/${country}/music/most-played/${limit}/songs.json`,
    { signal: options.signal }
  );
  if (!feedResponse.ok) throw new Error(`Topplisten svarte ${feedResponse.status}.`);

  const feed = (await feedResponse.json()) as ChartFeed;
  const ids = (feed.feed?.results ?? [])
    .map((row) => row.id)
    .filter((id): id is string => !!id);
  if (ids.length === 0) return [];

  const lookup = await fetch(
    `https://itunes.apple.com/lookup?id=${ids.join(',')}&entity=song&country=${
      options.country?.toUpperCase() ?? 'NO'
    }`,
    { signal: options.signal }
  );
  if (!lookup.ok) return [];

  const parsed = JSON.parse(await lookup.text()) as { results?: RawResult[] };
  const byId = new Map<number, MusicTrack>();
  for (const row of parsed.results ?? []) {
    if (typeof row.trackId !== 'number' || !row.previewUrl) continue;
    byId.set(row.trackId, {
      trackId: row.trackId,
      title: row.trackName ?? 'Ukjent tittel',
      artist: row.artistName ?? 'Ukjent artist',
      artworkUrl: upscaleArtwork(row.artworkUrl100, 200),
      previewUrl: row.previewUrl,
    });
  }

  return ids
    .map((id) => byId.get(Number(id)))
    .filter((track): track is MusicTrack => !!track);
}

/**
 * What EkteTid's own users have been attaching lately.
 *
 * The database does the aggregating, behind a definer function, so nothing
 * here sees a post or an author — only a track and how often it was used.
 */
export async function fetchCommunityMusic(limit = 12): Promise<MusicTrack[]> {
  const { data, error } = await supabase.rpc('trending_music', { p_limit: limit });
  if (error) throw error;

  return (data ?? [])
    .filter((row) => !!row.preview_url && !!row.title)
    .map((row) => ({
      trackId: Number(row.track_id),
      title: row.title,
      artist: row.artist ?? 'Ukjent artist',
      artworkUrl: row.artwork_url ?? null,
      previewUrl: row.preview_url,
    }));
}

/**
 * The list to show before anyone has typed anything.
 *
 * Prefers what people here are using, and falls back to the country's chart
 * while that is still thin — which it will be for a while after this ships,
 * since it needs two different people to have picked the same song. Neither
 * failing is fatal: an empty suggestion list costs a search box nothing.
 */
export async function fetchMusicSuggestions(
  options: { signal?: AbortSignal; limit?: number } = {}
): Promise<MusicSuggestions> {
  const limit = options.limit ?? 12;

  const community = await fetchCommunityMusic(limit).catch(() => [] as MusicTrack[]);
  if (community.length >= MIN_COMMUNITY) {
    return { source: 'community', tracks: community };
  }

  const chart = await fetchChartMusic({ signal: options.signal, limit }).catch(
    () => [] as MusicTrack[]
  );
  return { source: 'chart', tracks: chart };
}

/**
 * Re-resolve a preview URL from a track id.
 *
 * Apple's preview URLs are not promised to be permanent, and a post can outlive
 * one. Kept for whoever finds a silent post: the id is stored precisely so this
 * is possible, and nothing calls it yet.
 */
export async function lookupPreviewUrl(
  trackId: number,
  options: { signal?: AbortSignal; country?: string } = {}
): Promise<string | null> {
  const url =
    `https://itunes.apple.com/lookup?id=${trackId}` +
    `&country=${options.country ?? 'NO'}`;
  const response = await fetch(url, { signal: options.signal });
  if (!response.ok) return null;
  const parsed = JSON.parse(await response.text()) as { results?: RawResult[] };
  return parsed.results?.[0]?.previewUrl ?? null;
}
