export function isLockScreenActivityEnabled(): boolean {
  return false;
}

export async function setLockScreenActivityEnabled(
  _enabled: boolean,
  _displayName?: string | null
): Promise<void> {
  // Live Activities are an iOS system feature.
}
