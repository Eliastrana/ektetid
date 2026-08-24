import type { EventSubscription } from 'expo-modules-core';

/**
 * The Android build's stand-in for the volume-button observer.
 *
 * The native module is declared for Apple platforms only — see
 * expo-module.config.json — so there is nothing to require here. Without this
 * file Android resolves index.ts instead, and
 * `requireNativeModule('VolumeButtons')` throws while post-video's module
 * loads, which took the whole app down at launch rather than only where a video
 * appears.
 *
 * Android exposes volume changes through a ContentObserver on
 * Settings.System.VOLUME_SETTINGS, so this is implementable if the shortcut
 * turns out to be worth having here. The unmute button in the album chrome is
 * the deliberate control either way; this was only ever the shortcut.
 */
export function addVolumeChangeListener(
  _listener: (event: { volume: number }) => void
): EventSubscription {
  return { remove() {} };
}
