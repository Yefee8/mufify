import type { ReactNode } from 'react';
import { useWindowDimensions } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';

import { SHEET_FADE_COMPLETE_AT } from '@/services/motion';

export interface SheetProps {
  /**
   * 0 closed, 1 open. Owned by the caller, not by this component.
   *
   * A module-level `makeMutable`, so a gesture can drive it directly from a
   * worklet without the value being captured by a hook — which is what the
   * React Compiler's immutability rule rejects, correctly, for ordinary values.
   * It is also what makes the sheet feel attached to the finger: the same value
   * the drag writes is the one this reads.
   */
  progress: SharedValue<number>;
  /** Mounted. Kept separate so expensive contents stay out of the closed path. */
  visible: boolean;
  /** Settled open. Gates touches, so a closing sheet stops taking them at once. */
  expanded: boolean;
  /** Stacking order and surface colour, e.g. `absolute inset-0 z-30 bg-surface`. */
  className: string;
  /**
   * Fade in as well as slide.
   *
   * On for a sheet arriving over the app, where the movement alone reads as two
   * screens sliding past each other. **Off for a sheet arriving over another
   * opaque sheet**, which has nothing to fade against — and, on Android, an
   * animated alpha promotes the surface to a hardware layer for the duration
   * and releases it afterwards, which is a cycle SVG children have been seen
   * not to survive. The queue's close chevron was drawing for one frame and
   * then disappearing on a device, and this is the shape of that.
   */
  fade?: boolean;
  children: ReactNode;
}

/**
 * A full-height surface that arrives from the bottom.
 *
 * The one place the sheet transition is defined. Now Playing had this tuned by
 * hand and reads right; the queue was written separately against Reanimated's
 * `SlideInDown`/`SlideOutDown` layout animations and read badly — a spring in,
 * a plain timing out, no mass term so not the damping ratio that was tuned, no
 * velocity handoff and no fade. Both go through here now, so a third sheet
 * inherits the motion instead of re-deriving it.
 *
 * Two things are deliberately *not* here. There is no safe area: Now Playing
 * insets top and bottom, the queue's own screen does its own, and a sheet that
 * decided for them would be wrong for one of them. And there is no state — see
 * `useSheet`, which owns opening and closing; this draws whatever `progress`
 * currently says.
 */
export function Sheet({
  progress,
  visible,
  expanded,
  className,
  fade = true,
  children,
}: SheetProps) {
  const { height } = useWindowDimensions();

  const style = useAnimatedStyle(() => ({
    // Opaque well before the travel ends. Tracking the whole gesture leaves the
    // surface half transparent at the midpoint, and the screen underneath reads
    // straight through it — a cross-fade between two screens rather than one
    // sheet arriving over another. A sheet that never fades stays at 1, so the
    // platform has no reason to give it a layer at all.
    opacity: fade
      ? interpolate(progress.value, [0, SHEET_FADE_COMPLETE_AT], [0, 1], Extrapolation.CLAMP)
      : 1,
    // Linear against the shared value on purpose: the easing belongs to the
    // spring driving that value, and a curve here too would compound the two
    // into something that reads as a stutter.
    transform: [{ translateY: interpolate(progress.value, [0, 1], [height, 0]) }],
  }));

  return (
    <Animated.View pointerEvents={expanded ? 'auto' : 'none'} style={style} className={className}>
      {visible ? children : null}
    </Animated.View>
  );
}
