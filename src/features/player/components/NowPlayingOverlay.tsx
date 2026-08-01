import { useWindowDimensions } from 'react-native';
import Animated, { interpolate, useAnimatedStyle } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PlayerScreen } from '../PlayerScreen';
import { playerExpansion } from '../playerExpansion';

export interface NowPlayingOverlayProps {
  /** Keeps the expensive player contents out of the collapsed render path. */
  visible: boolean;
  /** Enables controls only after the opening gesture has settled. */
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
}

/** Root-mounted Now Playing surface driven directly by the mini-player gesture. */
export function NowPlayingOverlay({ visible, expanded, onExpandedChange }: NowPlayingOverlayProps) {
  const { height } = useWindowDimensions();
  const style = useAnimatedStyle(() => ({
    opacity: playerExpansion.value,
    transform: [{ translateY: interpolate(playerExpansion.value, [0, 1], [height, 0]) }],
  }));

  return (
    <Animated.View
      pointerEvents={expanded ? 'auto' : 'none'}
      style={style}
      className="absolute inset-0 z-10 bg-surface"
    >
      {visible ? (
        <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-surface">
          <PlayerScreen onExpandedChange={onExpandedChange} />
        </SafeAreaView>
      ) : null}
    </Animated.View>
  );
}
