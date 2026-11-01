import { GripVertical } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Easing, runOnJS, useAnimatedStyle, withTiming } from 'react-native-reanimated';

import { liftFeedback } from '@/services/haptics';
import { useThemeColors } from '@/theme/useTheme';

import {
  beginDrag,
  cancelDrag,
  dragFrom,
  dragOffset,
  dragSettled,
  dragTo,
  endDrag,
  shiftFor,
  updateDrag,
} from './reorderDrag';

/** Must match `PlaylistEntryRow`'s `h-16`. Drag maths is in row units. */
export const ENTRY_HEIGHT = 64;

/** Long enough that a scroll is not a drag, short enough to feel like a grab. */
const HOLD_MS = 120;
/** A row sliding out of the way. Quick, because it is an answer to a finger. */
const SHIFT_MS = 160;
/** Picked up: the lift, and the drop back. */
const LIFT_MS = 120;
const LIFT_SCALE = 1.03;

export interface ReorderableEntryProps {
  children: ReactNode;
  /** This row's index in the list as currently rendered. */
  index: number;
  /** How many rows there are, so a drag cannot leave the list. */
  count: number;
  /** Committed on release, with the final index. */
  onMove: (from: number, to: number) => void;
  accessibilityLabel: string;
}

/**
 * One playlist row, draggable by its handle, with the rest making room.
 *
 * A handle rather than a long-press-anywhere drag. Long press is already the
 * action sheet everywhere else in the app, and a list where holding a row
 * sometimes picks it up and sometimes opens a menu is a list nobody trusts. The
 * handle is also the only part of this that a screen reader user can find, which
 * is why it carries the label.
 *
 * **What the rest of the list does is the fix.** It used to do nothing: only
 * the held row moved, the gap it left stayed open, and the row you were
 * dragging past did not budge — so there was nowhere to drop into and no way
 * to know where it would land until you let go and looked. Every other row now
 * slides one slot towards that gap as the held row passes it, which is the
 * list showing you the order you are about to commit.
 *
 * The lift and the drop are animated rather than switched. `scale` and the
 * shadow used to change between frames with nothing between them, which reads
 * as a glitch rather than as picking something up.
 *
 * The database is still only written on release — see `reorderDrag` — so what
 * moves during the drag is pixels, not rows. The row lands in its new slot
 * without waiting for that write: `useReorderableEntries` renders the drop and
 * lets the query catch up.
 */
export function ReorderableEntry({
  children,
  index,
  count,
  onMove,
  accessibilityLabel,
}: ReorderableEntryProps) {
  const colors = useThemeColors();

  const pan = Gesture.Pan()
    .activateAfterLongPress(HOLD_MS)
    .onStart(() => {
      beginDrag(index);
      runOnJS(liftFeedback)();
    })
    .onUpdate((event) => {
      updateDrag(index, event.translationY, ENTRY_HEIGHT, count);
    })
    .onEnd(() => {
      const target = dragTo.value;

      if (target === index) {
        // Went nowhere. Ease it back, because nothing else is going to move.
        cancelDrag();
        return;
      }

      /*
       * Hand the move over and drop the drag in the same breath.
       *
       * `onMove` puts the row in its new slot immediately — the list does not
       * wait for the database, see `useReorderableEntries` — so the transforms
       * that were standing in for the new order have to stop in the same
       * moment, or the row would be offset by a row on top of a layout that
       * already moved it. `endDrag(true)` makes that reset a fact rather than
       * an animation, which is the difference between this and the version that
       * bounced twice on every drop.
       */
      runOnJS(onMove)(index, target);
      endDrag(true);
    })
    .onFinalize(() => {
      // A cancelled gesture never reaches `onEnd`; without this the list would
      // stay shifted around a drag that is no longer happening.
      if (dragFrom.value === index) cancelDrag();
    });

  const style = useAnimatedStyle(() => {
    const from = dragFrom.value;
    const held = from === index;

    if (held) {
      return {
        transform: [
          { translateY: dragOffset.value },
          { scale: withTiming(LIFT_SCALE, { duration: LIFT_MS }) },
        ],
        zIndex: 10,
        elevation: 6,
      };
    }

    const shift = shiftFor(index, from, dragTo.value, ENTRY_HEIGHT);

    return {
      transform: [
        {
          // Instant after a committed drop, animated otherwise — see
          // `dragSettled`. Both are a trip to zero; only one of them has
          // anywhere to travel.
          translateY: dragSettled.value
            ? shift
            : withTiming(shift, { duration: SHIFT_MS, easing: Easing.out(Easing.quad) }),
        },
        { scale: withTiming(1, { duration: LIFT_MS }) },
      ],
      zIndex: 0,
      elevation: 0,
    };
  });

  return (
    <Animated.View style={style} className="flex-row items-center bg-surface">
      <View className="flex-1">{children}</View>

      <GestureDetector gesture={pan}>
        <View
          accessibilityLabel={accessibilityLabel}
          accessibilityRole="adjustable"
          className="min-h-11 min-w-11 items-center justify-center pr-4"
        >
          <GripVertical color={colors.legend} size={20} strokeWidth={2} />
        </View>
      </GestureDetector>
    </Animated.View>
  );
}
