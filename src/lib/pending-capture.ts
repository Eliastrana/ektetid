/**
 * Handoff between the camera screen and the compose screen.
 *
 * Held in module scope rather than passed through router params: the payload
 * includes EXIF, which is an arbitrarily large object, and URL-encoding it into
 * a route would be both lossy and slow.
 */

import type { PendingCapture } from '@/lib/pending-capture.types';

export type { PendingCapture } from '@/lib/pending-capture.types';

let pending: PendingCapture | null = null;

export async function setPendingCapture(capture: PendingCapture): Promise<void> {
  pending = capture;
}

export function getPendingCapture(): PendingCapture | null {
  return pending;
}

export function clearPendingCapture(): void {
  pending = null;
}
