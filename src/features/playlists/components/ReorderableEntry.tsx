import { GripVertical } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { liftFeedback } from '@/services/haptics';
import { useThemeColors } from '@/theme/useTheme';

/** Must match `PlaylistEntryRow`'s `h-16`. Drag maths is in row units. */
export const ENTRY_HEIGHT = 64;

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
 * One playlist row, draggable by its handle.
 *
 * A handle rather than a long-press-anywhere drag. Long press is already the
 * action sheet everywhere else in the app, and a list where holding a row
 * sometimes picks it up and sometimes opens a menu is a list nobody trusts. The
 * handle is also the only part of this that a screen reader user can find, which
 * is why it carries the label.
 *
 * The row translates under the finger and the *list* is not reordered until
 * release. Reordering live would mean writing to the database on every frame —
 * positions are half of a unique index, so each write is a three-statement
 * transaction — and the rows would shuffle under the finger that is holding one.
 *
 * Only the dragged row moves. The gap it leaves does not close up as you drag,
 * which is less pretty than the usual implementation and much easier to be
 * correct about: there is exactly one animated value and one commit.
 */
export function ReorderableEntry({
  children,
  index,
  count,
  onMove,
  accessibilityLabel,
}: ReorderableEntryProps) {
  const colors = useThemeColors();
  const offset = useSharedValue(0);
  const dragging = useSharedValue(false);

  const pan = Gesture.Pan()
    .activateAfterLongPress(120)
    .onStart(() => {
      dragging.value = true;
      runOnJS(liftFeedback)();
    })
    .onUpdate((event) => {
      offset.value = event.translationY;
    })
    .onEnd((event) => {
      /*
       * Rounded, then clamped into the list. Without the clamp a drag past
       * either end computes an index outside the array, and the query would
       * either no-op or — worse, before `reorder` learned to return null —
       * write a shuffled order the user never asked for.
       */
      const moved = Math.round(event.translationY / ENTRY_HEIGHT);
      const target = Math.min(count - 1, Math.max(0, index + moved));
      if (target !== index) runOnJS(onMove)(index, target);
    })
    .onFinalize(() => {
      dragging.value = false;
      // Springs home rather than staying put: the list re-renders in the new
      // order from the database, so this row's own offset must be zero again.
      offset.value = withSpring(0, { damping: 24, stiffness: 260 });
    });

  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: offset.value }, { scale: dragging.value ? 1.02 : 1 }],
    // Lifted above its neighbours while held, so it reads as picked up.
    zIndex: dragging.value ? 10 : 0,
    opacity: dragging.value ? 0.95 : 1,
  }));

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
