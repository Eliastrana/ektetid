import type { PendingCapture } from '@/lib/pending-capture';

/** The browser has no system Photos album. */
export async function isLocalArchiveEnabled(_userId: string): Promise<boolean> {
  return false;
}

export async function setLocalArchiveEnabled(_userId: string, _enabled: boolean): Promise<void> {}

export async function archivePublishedCapture(
  _userId: string,
  _capture: PendingCapture
): Promise<boolean> {
  return false;
}
