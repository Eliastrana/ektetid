import { NativeModule, requireNativeModule, type EventSubscription } from 'expo-modules-core';

type Events = {
  onVolumeChange: (event: { volume: number }) => void;
};

declare class VolumeButtons extends NativeModule<Events> {}

const native = requireNativeModule<VolumeButtons>('VolumeButtons');

/**
 * Fires whenever the system output volume changes — which, in practice, means
 * the user pressed a volume button.
 *
 * The listener is what starts the native observation, so nothing is watched
 * while nothing is subscribed.
 */
export function addVolumeChangeListener(
  listener: (event: { volume: number }) => void
): EventSubscription {
  return native.addListener('onVolumeChange', listener);
}
