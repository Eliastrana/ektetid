import type { EventSubscription } from 'expo-modules-core';

/**
 * The web build's stand-in for the volume-button observer.
 *
 * The native module watches the system output volume so that reaching for the
 * volume keys unmutes a video. A browser has no access to the system volume —
 * only to the element's own — so there is nothing to observe and no way to
 * observe it.
 *
 * Without this, `requireNativeModule('VolumeButtons')` throws as soon as a
 * video post renders. The unmute button in the album chrome still works, which
 * is the deliberate control; this was only ever the shortcut.
 */
export function addVolumeChangeListener(
  _listener: (event: { volume: number }) => void
): EventSubscription {
  return { remove() {} };
}
