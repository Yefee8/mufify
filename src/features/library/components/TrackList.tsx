import { FlashList, type ListRenderItem } from '@shopify/flash-list';
import type { ReactElement } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { FIRST_PASS } from '@/components/ui/listFirstPass';
import type { TrackListItem } from '@/db/queries/tracks';
import { useMiniPlayerInset } from '@/features/player/playerLayerLayout';

import { LibraryRow } from './LibraryRow';

/**
 * Every row is exactly this tall, from `h-16` on `TrackRow`.
 *
 * Handed to FlashList so it never has to measure. Keep the two in step: a wrong
 * value here does not break layout — the row still draws at its real height —
 * it makes the scrollbar and every scroll-to-index land slightly off.
 */
const ROW_HEIGHT = 64;

/**
 * How far beyond the viewport to render, in px.
 *
 * FlashList's default is 250, which with 64px rows is under four rows of buffer
 * in each direction — a flick outruns it immediately, and the rows that have not
 * caught up are simply blank. That is the "some of the songs aren't showing and
 * randomly shows" report, exactly.
 *
 * 1200 is about eighteen extra rows each way: enough that a hard fling stays
 * ahead of the finger, and still bounded, so a 10,000-track library does not
 * quietly become a 10,000-view render.
 */
const DRAW_DISTANCE = 1_200;

/**
 * The buffer for the first frame: none. Only the rows on screen are built.
 *
 * The full buffer is eighteen rows past the bottom edge that nobody can see
 * yet, and on the frame a list mounts — an album opening, the tracks view
 * coming back — building them was most of the work standing between the tap
 * and the screen. Measured on the emulator, an artist with forty tracks went
 * from about two dozen rows on the first frame to the eight that fit.
 */
const FIRST_DRAW_DISTANCE = 0;

/**
 * When the buffer grows to its full size: after the push transition has run.
 * A fling needs the buffer; a list that has just appeared has not been flung.
 */
const WIDEN_AFTER_MS = 350;

const NO_ANCHOR = { disabled: true } as const;

export interface TrackListProps {
  tracks: TrackListItem[];
  locale: string;
  /** Plays the track. */
  onPress: (id: number) => void;
  /** Opens the action sheet. */
  onLongPress: (id: number) => void;
  /** Swipe left on a row. */
  onSwipeToQueue: (id: number) => void;
  /** Id of the playing track, so one row can be marked. */
  currentTrackId: number | null;
  /** The list is in selection mode: rows tick instead of playing. */
  isSelecting?: boolean;
  /** Which rows are ticked. */
  selected?: ReadonlySet<number>;
  empty: ReactElement | null;
}

/**
 * The library list itself.
 *
 * Split out of `LibraryScreen` because the screen had grown past what one
 * component should hold once swiping and the action sheet arrived —
 * `AGENTS.md` puts a hard limit at 300 lines. The screen now decides *what*
 * happens; this decides how rows are drawn.
 */
export function TrackList({
  tracks,
  locale,
  onPress,
  onLongPress,
  onSwipeToQueue,
  currentTrackId,
  isSelecting = false,
  selected,
  empty,
}: TrackListProps) {
  const { t } = useTranslation();
  /*
   * A runtime measurement, so it cannot be a Tailwind class — the config
   * compiles anything outside the spacing scale to nothing at all. This is the
   * exception `AGENTS.md` names.
   */
  const bottomInset = useMiniPlayerInset();

  const swipeLabel = t('track.addToQueue');

  const [drawDistance, setDrawDistance] = useState(FIRST_DRAW_DISTANCE);
  useEffect(() => {
    const timer = setTimeout(() => setDrawDistance(DRAW_DISTANCE), WIDEN_AFTER_MS);
    return () => clearTimeout(timer);
  }, []);

  const renderItem = useCallback<ListRenderItem<TrackListItem>>(
    ({ item }) => {
      return (
        <LibraryRow
          track={item}
          locale={locale}
          onPress={onPress}
          onLongPress={onLongPress}
          onSwipeToQueue={onSwipeToQueue}
          isCurrent={item.id === currentTrackId}
          isSelecting={isSelecting}
          isSelected={selected?.has(item.id) ?? false}
          swipeLabel={swipeLabel}
        />
      );
    },
    [
      locale,
      onPress,
      onLongPress,
      onSwipeToQueue,
      currentTrackId,
      isSelecting,
      selected,
      swipeLabel,
    ],
  );

  return (
    <FlashList
      data={tracks}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      drawDistance={drawDistance}
      overrideProps={FIRST_PASS}
      overrideItemLayout={setRowHeight}
      // So the last rows clear the transport strip instead of sitting under it.
      contentContainerStyle={{ paddingBottom: bottomInset }}
      /*
        No anchoring. FlashList 2 holds the first visible row in place whenever
        the data changes, which is a chat log's behaviour: here it meant that
        changing the sort kept the old top row on screen and opened the newly
        ordered list somewhere in its middle. A library list is read from the
        top, and a new order is a new list — see `orderKey` in LibraryTracks.
      */
      maintainVisibleContentPosition={NO_ANCHOR}
      /*
        No pull to refresh.

        It ran a full rescan, which on a real library is a sweep of everything
        MediaStore knows about — a minute of work started by a gesture people
        make to see the top of a list. Scanning is something you press, and
        there is a button that says so; see `docs/adr/010`.
      */
      ListEmptyComponent={empty}
    />
  );
}

function keyExtractor(track: TrackListItem): string {
  return String(track.id);
}

/** Uniform rows, so FlashList can skip measurement entirely. */
function setRowHeight(layout: { span?: number; size?: number }): void {
  layout.size = ROW_HEIGHT;
}
