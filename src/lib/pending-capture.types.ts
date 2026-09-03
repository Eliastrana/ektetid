export type PendingCapture = {
  /**
   * Always a still. For video this is the extracted first frame, so grids,
   * map pins and notifications never need to decode the clip.
   */
  imageUri: string;
  videoUri: string | null;
  selfieUri: string | null;
  exif: Record<string, unknown> | null;
  width: number;
  height: number;
};
