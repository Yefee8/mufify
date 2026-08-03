import { useCallback, useState } from 'react';
import { runOnJS, withSpring, type SharedValue } from 'react-native-reanimated';

import { isInstant, sheetSpring, SPEED_MULTIPLIERS } from '@/services/motion';
import { getAnimationSpeed } from '@/services/settings';
import { useReducedMotion } from '@/theme/useReducedMotion';

export interface SheetController {
  /** Mounted. False once a close has finished, so contents stop costing anything. */
  visible: boolean;
  /** Settled open. Drives `pointerEvents`, so a closing sheet stops taking touches. */
  expanded: boolean;
  /**
   * Mount without animating.
   *
   * For the moment a drag *begins*: the contents have to exist before the
   * finger starts moving the surface, or the first frames of the gesture are
   * spent waiting for a render the gesture itself triggered.
   */
  prepare: () => void;
  /**
   * Animate open or closed. `velocity` is in progress units per second — the
   * gesture's px/s over the screen height, which is what the value measures.
   */
  setOpen: (open: boolean, velocity?: number) => void;
}

/**
 * Drive one sheet's progress value to its target.
 *
 * Module level, and it takes the shared value as an argument, because the
 * React Compiler's immutability rule rejects mutating a value a hook has
 * captured — correctly, for ordinary values, and unavoidable friction for
 * Reanimated. Writing it here rather than inside `useCallback` satisfies the
 * rule honestly instead of switching it off.
 */
function settleSheet(
  progress: SharedValue<number>,
  target: number,
  multiplier: number,
  velocity: number,
  onRested: () => void,
): void {
  if (isInstant(multiplier)) {
    progress.value = target;
    onRested();
    return;
  }

  progress.value = withSpring(target, sheetSpring(velocity, multiplier), (finished) => {
    'worklet';
    if (finished) runOnJS(onRested)();
  });
}

/**
 * Opening and closing one sheet.
 *
 * Pulled out of `PlayerLayer` because the queue needed the same thing and got a
 * different one. This is the whole state machine: `visible` is mounted,
 * `expanded` is interactive, and the gap between them is the animation.
 * Closing sets `expanded` false immediately and `visible` false only when the
 * spring lands, so a sheet stops taking touches the moment it starts leaving
 * but does not vanish mid-flight.
 *
 * The speed is read **when a sheet opens**, not when this hook runs. Both root
 * sheets live in a layer mounted once for the app's lifetime, so a value read
 * at render would be whatever it was at launch and the Settings row would
 * appear to do nothing until a cold start.
 */
export function useSheet(progress: SharedValue<number>): SheetController {
  const [visible, setVisible] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const reducedMotion = useReducedMotion();

  const prepare = useCallback(() => setVisible(true), []);

  const setOpen = useCallback(
    (open: boolean, velocity = 0) => {
      // "Remove animations" in Android's accessibility settings is often set by
      // people for whom motion causes actual nausea. It takes the same path as
      // choosing Instant, rather than a second, nearly-identical one.
      const multiplier = reducedMotion ? 0 : SPEED_MULTIPLIERS[getAnimationSpeed()];

      setExpanded(open);
      if (open) setVisible(true);

      settleSheet(progress, open ? 1 : 0, multiplier, velocity, () => {
        if (!open) setVisible(false);
      });
    },
    /*
     * `progress` is absent on purpose. A shared value handle never changes
     * identity, and listing one as a dependency of a hook is what pulls it into
     * the closure the immutability rule is about. `SwipeableRow` carries the
     * same exemption for the same reason.
     */
    // eslint-disable-next-line react-hooks/exhaustive-deps -- shared values are stable handles
    [reducedMotion],
  );

  return { visible, expanded, prepare, setOpen };
}
