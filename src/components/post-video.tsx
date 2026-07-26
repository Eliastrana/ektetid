import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { SymbolView } from 'expo-symbols';

type Props = {
  uri: string;
  /** Whether this post is the one on screen. Off-screen clips do not play. */
  active: boolean;
};

/**
 * A clip in the carousel: plays itself, loops, and starts silent.
 *
 * Muted at first because the album auto-advances through posts and sound that
 * arrives unasked — on a bus, in a meeting — is the fastest way to make someone
 * close an app. The control says so, and one tap turns it on.
 *
 * Playback is tied to whether the post is the current one rather than left
 * running: several decoders playing at once for posts nobody is looking at is
 * the usual reason a carousel of video gets hot and drops frames.
 */
export function PostVideo({ uri, active }: Props) {
  const [muted, setMuted] = useState(true);

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

  return (
    <View className="flex-1">
      <VideoView
        style={{ flex: 1 }}
        player={player}
        // The album has its own chrome, and the system controls would sit on
        // top of it and swallow the tap-to-advance gesture.
        nativeControls={false}
        contentFit="cover"
        // The photo underneath is the same frame, so a black flash while the
        // first frame decodes would be a step backwards.
        allowsPictureInPicture={false}
      />

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={muted ? 'Slå på lyd' : 'Slå av lyd'}
        onPress={() => setMuted((value) => !value)}
        hitSlop={10}
        className="absolute right-4 top-4 h-10 w-10 items-center justify-center rounded-full bg-overlay active:bg-overlay-strong">
        <SymbolView
          name={muted ? 'speaker.slash.fill' : 'speaker.wave.2.fill'}
          size={16}
          tintColor="#ffffff"
          fallback={<Text className="text-ink">{muted ? '🔇' : '🔊'}</Text>}
        />
      </Pressable>
    </View>
  );
}
