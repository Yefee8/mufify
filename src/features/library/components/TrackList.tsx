import { FlashList, type ListRenderItem } from '@shopify/flash-list';
import type { ReactElement } from 'react';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshControl } from 'react-native';

import type { TrackListItem } from '@/db/queries/tracks';
import { useMiniPlayerInset } from '@/features/player/playerLayerLayout';
import { useThemeColors } from '@/theme/useTheme';

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
  isRefreshing: boolean;
  onRefresh: () => void;
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
  isRefreshing,
  onRefresh,
  empty,
}: TrackListProps) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  /*
   * A runtime measurement, so it cannot be a Tailwind class — the config
   * compiles anything outside the spacing scale to nothing at all. This is the
   * exception `AGENTS.md` names.
   */
  const bottomInset = useMiniPlayerInset();

  const swipeLabel = t('track.addToQueue');

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
          swipeLabel={swipeLabel}
        />
      );
    },
    [locale, onPress, onLongPress, onSwipeToQueue, currentTrackId, swipeLabel],
  );

  return (
    <FlashList
      data={tracks}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      drawDistance={DRAW_DISTANCE}
      overrideItemLayout={setRowHeight}
      // So the last rows clear the transport strip instead of sitting under it.
      contentContainerStyle={{ paddingBottom: bottomInset }}
      /*
        Pull to refresh re-indexes and sweeps. Without it a user who has just
        copied files in has no way to make the app look again short of restarting
        it — and Android's own scanner may not have noticed yet either.
      */
      refreshControl={
        <RefreshControl
          refreshing={isRefreshing}
          onRefresh={onRefresh}
          tintColor={colors.signal}
          colors={[colors.signal]}
          progressBackgroundColor={colors.panel}
        />
      }
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
