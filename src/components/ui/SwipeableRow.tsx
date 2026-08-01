import type { LucideIcon } from 'lucide-react-native';
import { useMemo, type ReactNode } from 'react';
import { View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { useThemeColors } from '@/theme/useTheme';

/** How far the row must travel for the action to fire. */
const COMMIT_DISTANCE = 88;
/** Horizontal movement below this leaves the gesture to the list's scroll. */
const ACTIVATION_SLOP = 16;
/** Resistance past the commit point, so the row cannot be dragged off-screen. */
const OVERSHOOT_RATIO = 0.2;

export interface SwipeableRowProps {
  children: ReactNode;
  /** Fired when the row is dragged left past the commit distance. */
  onSwipe: () => void;
  /** Drawn in the track the row uncovers. */
  icon: LucideIcon;
  /** Announced to screen readers as the equivalent action. */
  accessibilityLabel: string;
}

/**
 * A list row that reveals one action when dragged left.
 *
 * Transient by design: the row never *stays* open. It follows the finger, and
 * on release it either fires and springs home or just springs home. That is a
 * deliberate departure from the usual swipe-to-reveal drawer, for one reason
 * that matters more than the convention — this lives inside a recycling
 * virtualized list, and a row holding open state gets recycled with it, so the
 * drawer reappears under a completely different track a hundred rows later.
 * There is no open state to leak here.
 *
 * `activeOffsetX` and `failOffsetY` together mean a vertical drag never steals
 * from the list: the gesture only claims the touch once it is clearly sideways,
 * so scrolling through a library feels exactly as it did before.
 *
 * The gesture is an addition, never the only route. Everything reachable by
 * swiping is also in the long-press action sheet, because a swipe is invisible
 * and cannot be reached by anyone driving the phone with a screen reader.
 */
export function SwipeableRow({
  children,
  onSwipe,
  icon: Icon,
  accessibilityLabel,
}: SwipeableRowProps) {
  const colors = useThemeColors();
  const offset = useSharedValue(0);
  /** Grows as the row nears the commit point, so the icon fades in with it. */
  const progress = useSharedValue(0);

  /*
   * Memoized, because a `Gesture.Pan()` is not free.
   *
   * Building one allocates a handler and `GestureDetector` re-attaches it when
   * the object identity changes. This is inside a virtualized list, so an
   * unmemoized gesture meant rebuilding and re-attaching one per visible row on
   * every parent render — roughly forty at a time. `onSwipe` is the only
   * dependency, and callers pass a stable one.
   */
  const pan = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-ACTIVATION_SLOP, ACTIVATION_SLOP])
        .failOffsetY([-ACTIVATION_SLOP, ACTIVATION_SLOP])
        .onUpdate((event) => {
          // Left only. Dragging right does nothing, rather than doing this
          // action in reverse — one gesture, one meaning.
          const travelled = Math.min(0, event.translationX);
          const past = Math.max(0, -travelled - COMMIT_DISTANCE);

          offset.value = travelled + past * (1 - OVERSHOOT_RATIO);
          progress.value = Math.min(1, -travelled / COMMIT_DISTANCE);
        })
        .onEnd((event) => {
          if (event.translationX <= -COMMIT_DISTANCE) runOnJS(onSwipe)();
        })
        .onFinalize(() => {
          offset.value = withSpring(0, { damping: 22, stiffness: 240 });
          progress.value = withTiming(0, { duration: 150 });
        }),
    /*
     * `onSwipe` only. The two shared values are deliberately absent: a
     * `useSharedValue` handle never changes identity, and listing one as a
     * dependency of a hook that then writes to it is what the compiler's
     * immutability rule rejects — correctly, for ordinary values.
     */
    // eslint-disable-next-line react-hooks/exhaustive-deps -- shared values are stable handles
    [onSwipe],
  );

  const rowStyle = useAnimatedStyle(() => ({ transform: [{ translateX: offset.value }] }));
  /*
   * Reaching full strength exactly at the commit point is the whole feedback
   * mechanism: the row tells you it will fire before you let go, so a swipe
   * that was not far enough is a decision rather than a surprise.
   */
  const trackStyle = useAnimatedStyle(() => ({ opacity: progress.value }));

  return (
    <View accessibilityLabel={accessibilityLabel}>
      {/* The action sits behind the row and is uncovered, not pushed in. */}
      <Animated.View
        pointerEvents="none"
        style={trackStyle}
        className="absolute inset-y-0 right-0 w-24 items-center justify-center bg-accent"
      >
        <Icon color={colors.onSignal} size={22} strokeWidth={2} />
      </Animated.View>

      <GestureDetector gesture={pan}>
        <Animated.View style={rowStyle} className="bg-surface">
          {children}
        </Animated.View>
      </GestureDetector>
    </View>
  );
}
