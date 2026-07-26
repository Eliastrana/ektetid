import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect } from 'react';
import { View } from 'react-native';

import { addVolumeChangeListener } from '@/../modules/volume-buttons';

type Props = {
  uri: string;
  /** Whether this post is the one on screen. Off-screen clips do not play. */
  active: boolean;
  muted: boolean;
  onUnmute: () => void;
  /** Show the whole frame rather than filling the screen. */
  uncropped: boolean;
};

/**
 * A clip in the carousel: plays itself, loops, and starts silent.
 *
 * Muted at first because the album auto-advances through posts, and sound that
 * arrives unasked — on a bus, in a meeting — is the fastest way to make someone
 * close an app.
 *
 * The control that unmutes lives in the album's chrome, not here. Inside this
 * view it sat within the carousel's gesture detector, so pressing it both
 * unmuted and registered as a tap on the photo, advancing to the next post.
 *
 * Playback is tied to whether the post is the current one rather than left
 * running: several decoders playing at once for posts nobody is looking at is
 * the usual reason a carousel of video gets hot and drops frames.
 */
export function PostVideo({ uri, active, muted, onUnmute, uncropped }: Props) {
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
   * The buttons belong to the system and cannot be intercepted, but the volume
   * they change can be watched — so a change while muted is read as the
   * request it plainly is. Only ever unmutes: turning the volume down is not a
   * reason to start playing sound.
   */
  useEffect(() => {
    if (!active || !muted) return;
    const subscription = addVolumeChangeListener(onUnmute);
    return () => subscription.remove();
  }, [active, muted, onUnmute]);

  return (
    <View className="flex-1">
      <VideoView
        style={{ flex: 1 }}
        player={player}
        // The album has its own chrome, and the system controls would sit on
        // top of it and swallow the tap-to-advance gesture.
        nativeControls={false}
        contentFit={uncropped ? 'contain' : 'cover'}
        allowsPictureInPicture={false}
      />
    </View>
  );
}
