import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle } from 'react-native-reanimated';

import { liftFeedback } from '@/services/haptics';

import { copyShown, dragKey, follow, pickUp, putDown } from '../reorderDrag';
import { DragHandle } from './DragHandle';

/** Must match `PlaylistEntryRow`'s `h-16`. Drag maths is in row units. */
export const ENTRY_HEIGHT = 64;

/** Long enough that a scroll is not a drag, short enough to feel like a grab. */
const HOLD_MS = 120;

export interface ReorderableEntryProps {
  children: ReactNode;
  /** The row's own identity, which survives a reorder — see `PlaylistEntry.entryId`. */
  entryId: number;
  /** This row's index in the list as currently rendered. */
  index: number;
  /** How many rows there are, so a drag cannot leave the list. */
  count: number;
  /** The finger has picked this row up. */
  onPickUp: (entryId: number, index: number) => void;
  /** The held row has crossed into another slot; reorder the list to match. */
  onSlotChange: (from: number, to: number) => void;
  /** The floating copy has landed in its slot; commit the drop. */
  onLanded: () => void;
  accessibilityLabel: string;
}

/**
 * One playlist row, draggable by its handle.
 *
 * A handle rather than a long-press-anywhere drag. Long press is already the
 * action sheet everywhere else in the app, and a list where holding a row
 * sometimes picks it up and sometimes opens a menu is a list nobody trusts. The
 * handle is also the only part of this that a screen reader user can find, which
 * is why it carries the label.
 *
 * The row itself never moves out of its layout slot and never carries a
 * transform. While it is held it is simply hidden, and `DragOverlay` draws the
 * copy that follows the finger; the rows around it move because the list is
 * reordered under the drag, with a layout animation doing the sliding. That is
 * what lets the drop end without anything having to be put back — see
 * `reorderDrag`.
 */
export function ReorderableEntry({
  children,
  entryId,
  index,
  count,
  onPickUp,
  onSlotChange,
  onLanded,
  accessibilityLabel,
}: ReorderableEntryProps) {
  const pan = Gesture.Pan()
    .activateAfterLongPress(HOLD_MS)
    .onStart((event) => {
      pickUp(entryId, index, event.absoluteY, ENTRY_HEIGHT);
      runOnJS(onPickUp)(entryId, index);
      runOnJS(liftFeedback)();
    })
    .onUpdate((event) => {
      follow(event.absoluteY, ENTRY_HEIGHT, count, onSlotChange);
    })
    .onEnd(() => {
      putDown(ENTRY_HEIGHT, onLanded);
    })
    .onFinalize(() => {
      // A gesture the system cancels never reaches `onEnd`. It still lands:
      // the list is already in the order the finger left it in.
      putDown(ENTRY_HEIGHT, onLanded);
    });

  // Hidden only once the copy is on screen, so there is never a frame with
  // neither. Opacity rather than unmounting: the row keeps its slot, its cell
  // and its gesture.
  const style = useAnimatedStyle(() => ({
    opacity: dragKey.value === entryId && copyShown.value === 1 ? 0 : 1,
  }));

  return (
    <Animated.View style={style} className="flex-row items-center bg-surface">
      <View className="flex-1">{children}</View>

      <GestureDetector gesture={pan}>
        <View accessibilityLabel={accessibilityLabel} accessibilityRole="adjustable">
          <DragHandle />
        </View>
      </GestureDetector>
    </Animated.View>
  );
}
