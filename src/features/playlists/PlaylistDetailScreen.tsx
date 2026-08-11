import { FlashList, type ListRenderItem } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { ListMusic } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EmptyState } from '@/components/ui/EmptyState';
import {
  deletePlaylist,
  LIKED_SONGS_ID,
  movePlaylistEntry,
  removeFromPlaylist,
  renamePlaylist,
  useFavoriteEntries,
  usePlaylistEntries,
  usePlaylists,
  type PlaylistEntry,
} from '@/db/queries/playlists';
import { useCurrentTrack } from '@/features/player/hooks/usePlayback';
import { useMiniPlayerInset } from '@/features/player/playerLayerLayout';
import { useMessages } from '@/i18n';
import { AudioEngine } from '@/services/audio/AudioEngine';
import { LIBRARY_SOURCE, type PlayableTrack, type QueueSource } from '@/services/audio/types';
import { getShuffleAlgorithm } from '@/services/settings';

import { AddTracksSheet } from './components/AddTracksSheet';
import { NamePlaylistDialog } from './components/NamePlaylistDialog';
import { PlaylistDetailHeader } from './components/PlaylistDetailHeader';
import { PlaylistEntryRow } from './components/PlaylistEntryRow';
import { ENTRY_HEIGHT, ReorderableEntry } from './components/ReorderableEntry';

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
  const playlist = usePlaylists().find((entry) => entry.id === playlistId);

  const [renaming, setRenaming] = useState(false);
  const [adding, setAdding] = useState(false);

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

  /*
   * User playlists declare themselves as the queue's source, which is
   * what puts rows in `stats_rollups` under entity type 'playlist'. Without it
   * the top-playlists list is permanently empty and looks like a user who never
   * plays playlists.
   */
  const source = useMemo<QueueSource>(
    () => (isLiked ? LIBRARY_SOURCE : { type: 'playlist', id: playlistId }),
    [isLiked, playlistId],
  );

  const playAll = useCallback(() => {
    if (entries.length > 0) void AudioEngine.setQueue(entries.map(toPlayableEntry), 0, source);
  }, [entries, source]);

  /*
   * Shuffle uses whichever algorithm Settings has selected, read at press time.
   * The queue is set first and shuffled second rather than shuffling the array
   * and setting it: the engine keeps the unshuffled order as `sourceQueue`, so
   * turning shuffle off later restores the playlist's real running order instead
   * of freezing whatever random arrangement started.
   */
  const shuffleAll = useCallback(async () => {
    if (entries.length === 0) return;
    await AudioEngine.setQueue(entries.map(toPlayableEntry), 0, source);
    await AudioEngine.setShuffled(true, getShuffleAlgorithm());
  }, [entries, source]);

  const playAt = useCallback(
    (position: number) => {
      const index = entries.findIndex((entry) => entry.position === position);
      if (index !== -1) void AudioEngine.setQueue(entries.map(toPlayableEntry), index, source);
    },
    [entries, source],
  );

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

  const onDelete = useCallback(() => {
    // Leave first: deleting under the screen would leave it rendering a playlist
    // that no longer exists for a frame.
    router.back();
    void deletePlaylist(playlistId);
  }, [router, playlistId]);

  const renderItem = useCallback<ListRenderItem<PlaylistEntry>>(
    ({ item, index }) =>
      isLiked ? (
        <PlaylistEntryRow
          entry={item}
          locale={i18n.language}
          onPress={playAt}
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
    [entries.length, isLiked, move, playAt, remove, i18n.language, t, currentTrack?.id],
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
        onAddTracks={isLiked ? undefined : () => setAdding(true)}
        onRename={isLiked ? undefined : () => setRenaming(true)}
        onDelete={isLiked ? undefined : onDelete}
      />

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
        ) : (
          <FlashList
            data={entries}
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
        <NamePlaylistDialog
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

/** A playlist entry as the engine wants it. */
function toPlayableEntry(entry: PlaylistEntry): PlayableTrack {
  return {
    id: entry.trackId,
    uri: entry.fileUri,
    title: entry.title,
    artistName: entry.artistName,
    albumName: entry.albumName,
    durationMs: entry.durationMs,
    artworkPath: entry.artworkPath,
    playCount: entry.playCount,
    isFavorite: entry.isFavorite,
  };
}
