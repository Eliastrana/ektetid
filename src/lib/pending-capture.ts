/**
 * Handoff between the camera screen and the compose screen.
 *
 * Held in module scope rather than passed through router params: the payload
 * includes EXIF, which is an arbitrarily large object, and URL-encoding it into
 * a route would be both lossy and slow.
 */

export type PendingCapture = {
  imageUri: string;
  selfieUri: string | null;
  exif: Record<string, unknown> | null;
  width: number;
  height: number;
};

let pending: PendingCapture | null = null;

export function setPendingCapture(capture: PendingCapture): void {
  pending = capture;
}

export function getPendingCapture(): PendingCapture | null {
  return pending;
}

export function clearPendingCapture(): void {
  pending = null;
}
