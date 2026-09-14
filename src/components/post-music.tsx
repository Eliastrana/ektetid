import { useVideoPlayer } from 'expo-video';
import { useEffect } from 'react';

import { addVolumeChangeListener } from '@/../modules/volume-buttons';

/**
 * The snippet attached to a photo: plays itself, loops, and starts silent.
 *
 * Renders nothing. expo-video rather than a new audio dependency — its player
 * handles an audio-only URL perfectly well, and adding expo-audio would have
 * meant a native rebuild for a feature that does not need one. The indicator
 * and the mute control live in the album's chrome, beside the ones the video
 * posts already use.
 *
 * Muted at first for the same reason a clip is: the album advances through
 * posts on a tap, and sound arriving unasked — on a bus, in a meeting — is the
 * fastest way to make someone close an app. It plays muted rather than waiting,
 * so unmuting drops you into the music where it has got to rather than starting
 * it over.
 */
export function PostMusic({
  uri,
  active,
  muted,
  onUnmute,
}: {
  uri: string;
  /** Whether this post is the one on screen. Off-screen snippets do not play. */
  active: boolean;
  muted: boolean;
  onUnmute: () => void;
}) {
  const player = useVideoPlayer(uri, (instance) => {
    instance.loop = true;
    instance.muted = true;
  });

  useEffect(() => {
    player.muted = muted;
  }, [muted, player]);

  useEffect(() => {
    if (active) player.play();
    else player.pause();
  }, [active, player]);

  /*
   * Reaching for the volume means you want to hear it.
   *
   * The same reading as the video posts: the buttons belong to the system and
   * cannot be intercepted, but the volume they change can be watched, so a
   * change while muted is taken as the request it plainly is. Only ever
   * unmutes.
   */
  useEffect(() => {
    if (!active || !muted) return;
    const subscription = addVolumeChangeListener(onUnmute);
    return () => subscription.remove();
  }, [active, muted, onUnmute]);

  return null;
}
