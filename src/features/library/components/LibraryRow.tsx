import { ListEnd } from 'lucide-react-native';
import { memo, useCallback, useMemo } from 'react';

import { SwipeableRow } from '@/components/ui/SwipeableRow';
import type { TrackListItem } from '@/db/queries/tracks';
import * as perf from '@/services/perf';

import { TrackRow } from './TrackRow';

export interface LibraryRowProps {
  track: TrackListItem;
  locale: string;
  /** Stable. Selection state is passed as booleans, never as an object. */
  onPress: (id: number) => void;
  onLongPress: (id: number) => void;
  onSwipeToQueue: (id: number) => void;
  isSelecting: boolean;
  isSelected: boolean;
  isCurrent: boolean;
  /** Already translated, for the swipe action's screen-reader label. */
  swipeLabel: string;
}

/**
 * One library row, with its gesture.
 *
 * Exists so `renderItem` can stay a one-liner that passes only primitives and
 * stable callbacks. The version this replaced built the whole tree inline,
 * including `onSwipe={() => onSwipeToQueue(item.id)}` — a fresh closure per row
 * per render, which defeats every memo below it.
 *
 * Memoized on primitives only. Nothing here takes the selection object, so a
 * render caused by something unrelated to this row cannot reach it.
 */
const LibraryRowComponent = function LibraryRow({
  track,
  locale,
  onPress,
  onLongPress,
  onSwipeToQueue,
  isSelecting,
  isSelected,
  isCurrent,
  swipeLabel,
}: LibraryRowProps) {
  // Dev-only. This is the counter that told the truth about the checkbox
  // freeze: 47 bodies per tap before the memo boundary, 1 after.
  perf.count('LibraryRow.body');
  const handleSwipe = useCallback(() => onSwipeToQueue(track.id), [onSwipeToQueue, track.id]);

  const row = useMemo(
    () => (
      <TrackRow
        track={track}
        locale={locale}
        onPress={onPress}
        onLongPress={onLongPress}
        isSelecting={isSelecting}
        isSelected={isSelected}
        isCurrent={isCurrent}
      />
    ),
    [track, locale, onPress, onLongPress, isSelecting, isSelected, isCurrent],
  );

  /*
   * No swipe while selecting. Two horizontal gestures on one row means the user
   * aiming for a checkbox occasionally queues a track instead, and during a
   * multi-select that is both wrong and hard to undo.
   */
  if (isSelecting) return row;

  return (
    <SwipeableRow onSwipe={handleSwipe} icon={ListEnd} accessibilityLabel={swipeLabel}>
      {row}
    </SwipeableRow>
  );
};

function isSameRow(previous: LibraryRowProps, next: LibraryRowProps): boolean {
  return (
    previous.track === next.track &&
    previous.locale === next.locale &&
    previous.onPress === next.onPress &&
    previous.onLongPress === next.onLongPress &&
    previous.onSwipeToQueue === next.onSwipeToQueue &&
    previous.isSelecting === next.isSelecting &&
    previous.isSelected === next.isSelected &&
    previous.isCurrent === next.isCurrent &&
    previous.swipeLabel === next.swipeLabel
  );
}

export const LibraryRow = memo(LibraryRowComponent, isSameRow);
