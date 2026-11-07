import { useLayoutEffect } from 'react';
import { View } from 'react-native';
import Animated, { runOnUI, useAnimatedStyle } from 'react-native-reanimated';

import type { PlaylistEntry } from '@/db/queries/playlists';

import { copyShown, copyTop, dragKey, lift, showCopy } from '../reorderDrag';
import { DragHandle } from './DragHandle';
import { ENTRY_HEIGHT } from './ReorderableEntry';
import { PlaylistEntryRow } from './PlaylistEntryRow';

export interface DragOverlayProps {
  /**
   * The row being dragged, and which drag this is. The last one is kept after
   * the drop — the copy stays mounted, invisible — and the session number is
   * what tells a second drag of the same row from the first.
   */
  dragged: { entry: PlaylistEntry; session: number } | null;
  locale: string;
  /** Whether the held row is the track playing, so the copy is drawn the same. */
  isCurrent: boolean;
}

const LIFT_SCALE = 1.03;
const LIFT_ELEVATION = 8;

/**
 * The copy of a held row that follows the finger, above the list.
 *
 * Mounted over the list for as long as the screen is, and invisible until a
 * drag shows it — so picking a row up never waits for a view to be created,
 * only for its contents to be filled in. Once React has drawn the row being
 * held, `showCopy` reveals it and hides the original in the same UI-thread
 * step: there is no frame with both and no frame with neither.
 *
 * It does not take touches. The finger that is moving it is still the one that
 * went down on the row's handle, and that gesture is what drives `copyTop`.
 */
export function DragOverlay({ dragged, locale, isCurrent }: DragOverlayProps) {
  const session = dragged?.session ?? 0;
  const entry = dragged?.entry ?? null;

  useLayoutEffect(() => {
    if (session > 0) runOnUI(showCopy)();
  }, [session]);

  const style = useAnimatedStyle(() => ({
    opacity: dragKey.value !== -1 && copyShown.value === 1 ? 1 : 0,
    transform: [{ translateY: copyTop.value }, { scale: 1 + (LIFT_SCALE - 1) * lift.value }],
    elevation: LIFT_ELEVATION * lift.value,
  }));

  return (
    <View pointerEvents="none" className="absolute inset-0 overflow-hidden">
      <Animated.View
        style={[{ height: ENTRY_HEIGHT }, style]}
        className="absolute inset-x-0 top-0 flex-row items-center bg-surface"
      >
        {entry === null ? null : (
          <>
            <View className="flex-1">
              <PlaylistEntryRow
                entry={entry}
                locale={locale}
                onPress={noop}
                onRemove={noop}
                isCurrent={isCurrent}
              />
            </View>
            <DragHandle />
          </>
        )}
      </Animated.View>
    </View>
  );
}

function noop(): void {
  // The copy is a picture of the row; it never receives a touch.
}
