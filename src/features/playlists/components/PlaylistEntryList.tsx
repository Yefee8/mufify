import { FlashList, type FlashListRef, type ListRenderItem } from '@shopify/flash-list';
import { useCallback, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';

import type { PlaylistEntry } from '@/db/queries/playlists';

import { setListScroll } from '../reorderDrag';
import { DragOverlay } from './DragOverlay';
import { PlaylistEntryRow } from './PlaylistEntryRow';
import { ENTRY_HEIGHT, ReorderableEntry } from './ReorderableEntry';

export interface PlaylistEntryListProps {
  listRef: RefObject<FlashListRef<PlaylistEntry> | null>;
  /** What to draw — the search's view of the list when one is active. */
  rows: PlaylistEntry[];
  /** How many entries the whole playlist has, which bounds a drag. */
  total: number;
  /** Rows are plain, not draggable: liked songs, or a search narrowing the list. */
  fixed: boolean;
  /** Liked songs cannot be removed from here — unliking is the way out. */
  removable: boolean;
  currentTrackId: number | null;
  bottomInset: number;
  playAt: (entryId: number) => void;
  remove: (entryId: number) => void;
  dragged: { entry: PlaylistEntry; session: number } | null;
  onPickUp: (entryId: number, index: number) => void;
  onSlotChange: (from: number, to: number) => void;
  onLanded: () => void;
}

/**
 * A playlist's rows, and the copy of a held row that floats above them.
 *
 * Split from `PlaylistDetailScreen` at the 300-line limit, along the line the
 * drag already drew: everything here is about rows on screen and moving them,
 * and the screen above owns the playlist — its name, cover, search and sheets.
 */
export function PlaylistEntryList({
  listRef,
  rows,
  total,
  fixed,
  removable,
  currentTrackId,
  bottomInset,
  playAt,
  remove,
  dragged,
  onPickUp,
  onSlotChange,
  onLanded,
}: PlaylistEntryListProps) {
  const { t, i18n } = useTranslation();

  const renderItem = useCallback<ListRenderItem<PlaylistEntry>>(
    ({ item, index }) =>
      // A drag reorders the whole list, and a filtered list is not the whole
      // list — so while a search is active rows are plain. Removing still
      // works; it is addressed by the row's own identity.
      fixed ? (
        <PlaylistEntryRow
          entry={item}
          locale={i18n.language}
          onPress={playAt}
          onRemove={removable ? remove : undefined}
          isCurrent={item.trackId === currentTrackId}
        />
      ) : (
        <ReorderableEntry
          entryId={item.entryId}
          index={index}
          count={total}
          onPickUp={onPickUp}
          onSlotChange={onSlotChange}
          onLanded={onLanded}
          accessibilityLabel={t('playlists.reorder', { title: item.title })}
        >
          <PlaylistEntryRow
            entry={item}
            locale={i18n.language}
            onPress={playAt}
            onRemove={removable ? remove : undefined}
            isCurrent={item.trackId === currentTrackId}
          />
        </ReorderableEntry>
      ),
    [
      currentTrackId,
      fixed,
      i18n.language,
      onLanded,
      onPickUp,
      onSlotChange,
      playAt,
      remove,
      removable,
      t,
      total,
    ],
  );

  return (
    <>
      <FlashList
        ref={listRef}
        data={rows}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        overrideItemLayout={setEntryHeight}
        contentContainerStyle={{ paddingBottom: bottomInset }}
        // Where a picked-up row is on screen depends on how far the list has
        // scrolled; the drag reads it at the moment of pick-up.
        onScroll={onScroll}
        scrollEventThrottle={16}
        /*
          No anchoring. FlashList 2 holds the first visible row in place when
          the data changes; during a drag that row may be the one being moved,
          and holding it would scroll the list under the finger.
        */
        maintainVisibleContentPosition={NO_ANCHOR}
      />
      {/* Over the list, in its coordinates: the held row's copy. */}
      <DragOverlay
        dragged={dragged}
        locale={i18n.language}
        isCurrent={dragged !== null && dragged.entry.trackId === currentTrackId}
      />
    </>
  );
}

const NO_ANCHOR = { disabled: true } as const;

function onScroll(event: NativeSyntheticEvent<NativeScrollEvent>): void {
  setListScroll(event.nativeEvent.contentOffset.y);
}

function keyExtractor(entry: PlaylistEntry): string {
  // The row's own identity, which survives a reorder — see `entryId`.
  return String(entry.entryId);
}

/** Uniform rows, so FlashList can skip measurement entirely. */
function setEntryHeight(layout: { span?: number; size?: number }): void {
  layout.size = ENTRY_HEIGHT;
}
