export type AlbumCoverLayout = 'full' | 'framed' | 'editorial';

export const ALBUM_ACCENTS = [
  { value: '#9B5CFF', label: 'Ultrafiolett' },
  { value: '#FF4FA3', label: 'Magenta' },
  { value: '#3B82F6', label: 'Elektrisk blå' },
  { value: '#21C7B7', label: 'Turkis' },
  { value: '#FF6B4A', label: 'Lava' },
  { value: '#FF4D6D', label: 'Signalrød' },
] as const;

export const ALBUM_LAYOUTS: { value: AlbumCoverLayout; label: string }[] = [
  { value: 'full', label: 'Heldekkende' },
  { value: 'framed', label: 'Ramme' },
  { value: 'editorial', label: 'Sentrert' },
];

export function albumCoverLayout(value: string | null | undefined): AlbumCoverLayout {
  return value === 'framed' || value === 'editorial' ? value : 'full';
}
