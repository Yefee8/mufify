import { ListEnd } from 'lucide-react-native';
import { memo, useCallback, useMemo } from 'react';

import { SwipeableRow } from '@/components/ui/SwipeableRow';
import type { TrackListItem } from '@/db/queries/tracks';

import { TrackRow } from './TrackRow';

export interface LibraryRowProps {
  track: TrackListItem;
  locale: string;
  /** Stable callbacks keep FlashList rows memoized. */
  onPress: (id: number) => void;
  onLongPress: (id: number) => void;
  onSwipeToQueue: (id: number) => void;
  isCurrent: boolean;
  isSelecting: boolean;
  isSelected: boolean;
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
 * Memoized on primitives only, so an unrelated screen render cannot reach it.
 */
const LibraryRowComponent = function LibraryRow({
  track,
  locale,
  onPress,
  onLongPress,
  onSwipeToQueue,
  isCurrent,
  isSelecting,
  isSelected,
  swipeLabel,
}: LibraryRowProps) {
  const handleSwipe = useCallback(() => onSwipeToQueue(track.id), [onSwipeToQueue, track.id]);

  const row = useMemo(
    () => (
      <TrackRow
        track={track}
        locale={locale}
        onPress={onPress}
        onLongPress={onLongPress}
        isCurrent={isCurrent}
        isSelecting={isSelecting}
        isSelected={isSelected}
      />
    ),
    [track, locale, onPress, onLongPress, isCurrent, isSelecting, isSelected],
  );

  /*
   * No swipe while selecting. The gesture that queues one track and the gesture
   * that scrolls past twenty you are ticking are the same flick, and a row that
   * quietly queued itself every time a finger slipped sideways would make
   * picking things out of a long list feel broken.
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
    previous.isCurrent === next.isCurrent &&
    previous.isSelecting === next.isSelecting &&
    previous.isSelected === next.isSelected &&
    previous.swipeLabel === next.swipeLabel
  );
}

export const LibraryRow = memo(LibraryRowComponent, isSameRow);
