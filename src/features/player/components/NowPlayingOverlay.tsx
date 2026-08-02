import { useWindowDimensions } from 'react-native';
import Animated, { Extrapolation, interpolate, useAnimatedStyle } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PlayerScreen } from '../PlayerScreen';
import { playerExpansion } from '../playerExpansion';

/**
 * How much of the travel the fade takes.
 *
 * Opacity used to track the whole gesture, so the surface was still half
 * transparent at the midpoint and the screen underneath read straight through
 * it — a
 * cross-fade between two screens rather than one sheet arriving over another.
 * Reaching full opacity early makes it a sheet; the movement carries the rest.
 */
const FADE_COMPLETE_AT = 0.4;

export interface NowPlayingOverlayProps {
  /** Keeps the expensive player contents out of the collapsed render path. */
  visible: boolean;
  /** Enables controls only after the opening gesture has settled. */
  expanded: boolean;
  onExpandedChange: (expanded: boolean, velocity?: number) => void;
  /** Opens the queue, which is a root-level surface rather than a route. */
  onOpenQueue: () => void;
}

/** Root-mounted Now Playing surface driven directly by the mini-player gesture. */
export function NowPlayingOverlay({
  visible,
  expanded,
  onExpandedChange,
  onOpenQueue,
}: NowPlayingOverlayProps) {
  const { height } = useWindowDimensions();
  const style = useAnimatedStyle(() => ({
    opacity: interpolate(
      playerExpansion.value,
      [0, FADE_COMPLETE_AT],
      [0, 1],
      Extrapolation.CLAMP,
    ),
    // Linear against the shared value on purpose: the easing belongs to the
    // spring driving that value, and putting a curve here too would compound
    // the two into something that reads as a stutter.
    transform: [{ translateY: interpolate(playerExpansion.value, [0, 1], [height, 0]) }],
  }));

  return (
    <Animated.View
      pointerEvents={expanded ? 'auto' : 'none'}
      style={style}
      className="absolute inset-0 z-30 bg-surface"
    >
      {visible ? (
        <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-surface">
          <PlayerScreen onExpandedChange={onExpandedChange} onOpenQueue={onOpenQueue} />
        </SafeAreaView>
      ) : null}
    </Animated.View>
  );
}
