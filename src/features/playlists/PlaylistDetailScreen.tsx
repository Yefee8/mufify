import { FlashList, type ListRenderItem } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { ListMusic, SearchX } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EmptyState } from '@/components/ui/EmptyState';
import { NameDialog } from '@/components/ui/NameDialog';
import { SearchField } from '@/components/ui/SearchField';
import {
  deletePlaylist,
  LIKED_SONGS_ID,
  movePlaylistEntry,
  removeFromPlaylist,
  renamePlaylist,
  setPlaylistFavorite,
  useFavoriteEntries,
  usePlaylistEntries,
  usePlaylists,
  type PlaylistEntry,
} from '@/db/queries/playlists';
import { useCurrentTrack } from '@/features/player/hooks/usePlayback';
import { useMiniPlayerInset } from '@/features/player/playerLayerLayout';
import { useMessages } from '@/i18n';
import { matchesSearch } from '@/services/text/search';

import { AddTracksSheet } from './components/AddTracksSheet';
import { CoverActionSheet } from './components/CoverActionSheet';
import { CoverCropSheet } from './components/CoverCropSheet';
import { usePlaylistCover } from './hooks/usePlaylistCover';
import { usePlaylistPlayback } from './hooks/usePlaylistPlayback';
import { PlaylistDetailHeader } from './components/PlaylistDetailHeader';
import { PlaylistEntryRow } from './components/PlaylistEntryRow';
import { ENTRY_HEIGHT, ReorderableEntry } from './components/ReorderableEntry';

/** Below this many rows the whole list is on one screen and a box is noise. */
const SEARCHABLE_FROM = 12;

export interface PlaylistDetailScreenProps {
  playlistId: number;
}

/** One playlist: its tracks, in order, with the ways to play and edit them. */
export function PlaylistDetailScreen({ playlistId }: PlaylistDetailScreenProps) {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const isLiked = playlistId === LIKED_SONGS_ID;
  const bottomInset = useMiniPlayerInset();
  const detailMessages = useMessages(isLiked ? 'playlists.likedEmpty' : 'playlists.detailEmpty');

  const playlistEntries = usePlaylistEntries(playlistId);
  const likedEntries = useFavoriteEntries();
  const entries = isLiked ? likedEntries : playlistEntries;

  /*
   * A search box for the list, shown only once it is long enough to need one.
   * Twelve rows fit on a screen and a box above them is noise; a hundred do
   * not. What is *played* stays the whole playlist — Play and Shuffle start the
   * list, not the filtered view of it, because a search is for finding a row,
   * and the queue a person expects from "Play" is the playlist they opened.
   */
  const [search, setSearch] = useState('');
  const searching = search.trim().length > 0;
  const shown = useMemo(
    () =>
      searching
        ? entries.filter((entry) => matchesSearch(search, entry.title, entry.artistName))
        : entries,
    [entries, search, searching],
  );
  const playlist = usePlaylists().find((entry) => entry.id === playlistId);

  const [renaming, setRenaming] = useState(false);
  const [adding, setAdding] = useState(false);
  const cover = usePlaylistCover(playlistId);

  /*
   * Which track is playing, so the row says so — the library has marked it
   * since the beginning and a playlist did not, which made the same list look
   * like two different features depending on where it was opened.
   *
   * `useCurrentTrack` rather than `usePlayback`: this list re-renders on the
   * track changing and must not re-render twice a second for a position no row
   * displays.
   */
  const currentTrack = useCurrentTrack();

  /** What is already here, so the picker can say so rather than hide it. */
  const existingIds = useMemo(
    () => new Set(entries.map((entry) => entry.trackId)),
    [entries],
  );

  const { playAll, shuffleAll, playAt } = usePlaylistPlayback(entries, playlistId, isLiked);

  const remove = useCallback(
    (position: number) => void removeFromPlaylist(playlistId, position),
    [playlistId],
  );

  const move = useCallback(
    (from: number, to: number) => void movePlaylistEntry(playlistId, from, to),
    [playlistId],
  );

  const onRename = useCallback(
    (name: string) => {
      setRenaming(false);
      void renamePlaylist(playlistId, name);
    },
    [playlistId],
  );

  const onToggleFavorite = useCallback(() => {
    if (playlist) void setPlaylistFavorite(playlistId, !playlist.isFavorite);
  }, [playlist, playlistId]);

  const onDelete = useCallback(() => {
    // Leave first: deleting under the screen would leave it rendering a playlist
    // that no longer exists for a frame.
    router.back();
    void deletePlaylist(playlistId);
  }, [router, playlistId]);

  const renderItem = useCallback<ListRenderItem<PlaylistEntry>>(
    ({ item, index }) =>
      // Reordering moves by *position in the whole list*, and a filtered list
      // has no such positions to offer — so while a search is active rows are
      // plain. Removing still works; it is keyed by the entry's own position.
      isLiked || searching ? (
        <PlaylistEntryRow
          entry={item}
          locale={i18n.language}
          onPress={playAt}
          onRemove={isLiked ? undefined : remove}
          isCurrent={item.trackId === currentTrack?.id}
        />
      ) : (
        <ReorderableEntry
          index={index}
          count={entries.length}
          onMove={move}
          accessibilityLabel={t('playlists.reorder', { title: item.title })}
        >
          <PlaylistEntryRow
            entry={item}
            locale={i18n.language}
            onPress={playAt}
            onRemove={remove}
            isCurrent={item.trackId === currentTrack?.id}
          />
        </ReorderableEntry>
      ),
    [entries.length, isLiked, searching, move, playAt, remove, i18n.language, t, currentTrack?.id],
  );

  const name = isLiked ? t('playlists.likedSongs') : (playlist?.name ?? '');
  const covers = isLiked
    ? entries.flatMap((entry) => (entry.artworkPath ? [entry.artworkPath] : [])).slice(0, 4)
    : (playlist?.mosaic ?? []);

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-surface">
      <PlaylistDetailHeader
        name={name}
        trackCount={entries.length}
        covers={covers}
        onPlay={playAll}
        onShuffle={() => void shuffleAll()}
        cover={playlist?.coverPath ?? null}
        onChangeCover={isLiked ? undefined : cover.open}
        onAddTracks={isLiked ? undefined : () => setAdding(true)}
        onRename={isLiked ? undefined : () => setRenaming(true)}
        onDelete={isLiked ? undefined : onDelete}
        isFavorite={playlist?.isFavorite ?? false}
        onToggleFavorite={isLiked ? undefined : onToggleFavorite}
      />

      {entries.length >= SEARCHABLE_FROM ? (
        <View className="px-6 pb-4">
          <SearchField
            value={search}
            onChange={setSearch}
            inRow
            placeholder={t('playlists.searchIn')}
          />
        </View>
      ) : null}

      {/* Bounded, so the list re-lays out when the rows above it change. */}
      <View className="flex-1">
        {entries.length === 0 ? (
          <EmptyState
            icon={ListMusic}
            messages={detailMessages}
            /* An empty playlist's one job is to be filled, so the way to fill
               it is the thing on screen rather than an icon in the bar. */
            actionLabel={isLiked ? undefined : t('playlists.addTracks.title')}
            onAction={isLiked ? undefined : () => setAdding(true)}
          />
        ) : shown.length === 0 ? (
          <EmptyState icon={SearchX} messages={[t('library.noResults', { term: search })]} />
        ) : (
          <FlashList
            data={shown}
            renderItem={renderItem}
            keyExtractor={keyExtractor}
            overrideItemLayout={setEntryHeight}
            contentContainerStyle={{ paddingBottom: bottomInset }}
          />
        )}
      </View>

      {isLiked ? null : (
        <AddTracksSheet
          visible={adding}
          playlistId={playlistId}
          existing={existingIds}
          onClose={() => setAdding(false)}
        />
      )}

      {isLiked ? null : (
        <CoverActionSheet
          visible={cover.choosing}
          hasCover={playlist?.coverPath != null}
          onPick={cover.pick}
          onClear={cover.clear}
          onClose={cover.close}
        />
      )}

      {isLiked ? null : (
        <CoverCropSheet
          source={cover.cropping}
          onCancel={cover.cancelCrop}
          onConfirm={cover.confirmCrop}
        />
      )}

      {isLiked ? null : (
        <NameDialog
          visible={renaming}
          title={t('playlists.rename')}
          initialName={playlist?.name ?? ''}
          onCancel={() => setRenaming(false)}
          onSubmit={onRename}
        />
      )}
    </SafeAreaView>
  );
}

function keyExtractor(entry: PlaylistEntry): string {
  // Position, not track id: the same track may legitimately appear twice.
  return `${entry.trackId}-${entry.position}`;
}

/** Uniform rows, so FlashList can skip measurement entirely. */
function setEntryHeight(layout: { span?: number; size?: number }): void {
  layout.size = ENTRY_HEIGHT;
}
