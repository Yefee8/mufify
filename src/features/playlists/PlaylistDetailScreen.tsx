import { FlashList, type ListRenderItem } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { ListMusic } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EmptyState } from '@/components/ui/EmptyState';
import {
  addTracksToPlaylist,
  deletePlaylist,
  movePlaylistEntry,
  removeFromPlaylist,
  renamePlaylist,
  usePlaylistEntries,
  usePlaylists,
  type PlaylistEntry,
} from '@/db/queries/playlists';
import { useMessages } from '@/i18n';
import { AudioEngine } from '@/services/audio/AudioEngine';
import type { PlayableTrack } from '@/services/audio/types';
import { getShuffleAlgorithm } from '@/services/settings';

import { usePlaybackControls } from '../player/hooks/usePlayback';
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
  const messages = useMessages('playlists.detailEmpty');

  const entries = usePlaylistEntries(playlistId);
  const playlist = usePlaylists().find((entry) => entry.id === playlistId);
  const { playFrom } = usePlaybackControls();

  const [renaming, setRenaming] = useState(false);
  const [adding, setAdding] = useState(false);

  const playAll = useCallback(() => {
    if (entries.length > 0) playFrom(entries.map(toPlayableEntry), 0);
  }, [entries, playFrom]);

  /*
   * Shuffle uses whichever algorithm Settings has selected, read at press time.
   * The queue is set first and shuffled second rather than shuffling the array
   * and setting it: the engine keeps the unshuffled order as `sourceQueue`, so
   * turning shuffle off later restores the playlist's real running order instead
   * of freezing whatever random arrangement started.
   */
  const shuffleAll = useCallback(async () => {
    if (entries.length === 0) return;
    await AudioEngine.setQueue(entries.map(toPlayableEntry), 0);
    await AudioEngine.setShuffled(true, getShuffleAlgorithm());
  }, [entries]);

  const playAt = useCallback(
    (position: number) => {
      const index = entries.findIndex((entry) => entry.position === position);
      if (index !== -1) playFrom(entries.map(toPlayableEntry), index);
    },
    [entries, playFrom],
  );

  const remove = useCallback(
    (position: number) => void removeFromPlaylist(playlistId, position),
    [playlistId],
  );

  const move = useCallback(
    (from: number, to: number) => void movePlaylistEntry(playlistId, from, to),
    [playlistId],
  );

  const onAddTracks = useCallback(
    (trackIds: number[]) => {
      setAdding(false);
      void addTracksToPlaylist(playlistId, trackIds);
    },
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
    ({ item, index }) => (
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
        />
      </ReorderableEntry>
    ),
    [entries.length, move, playAt, remove, i18n.language, t],
  );

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-surface">
      <PlaylistDetailHeader
        name={playlist?.name ?? ''}
        trackCount={entries.length}
        covers={playlist?.mosaic ?? []}
        onPlay={playAll}
        onShuffle={() => void shuffleAll()}
        onAddTracks={() => setAdding(true)}
        onRename={() => setRenaming(true)}
        onDelete={onDelete}
      />

      {/* Bounded, so the list re-lays out when the rows above it change. */}
      <View className="flex-1">
        {entries.length === 0 ? (
          <EmptyState
            icon={ListMusic}
            messages={messages}
            actionLabel={t('playlists.addTracks')}
            onAction={() => setAdding(true)}
          />
        ) : (
          <FlashList
            data={entries}
            renderItem={renderItem}
            keyExtractor={keyExtractor}
            overrideItemLayout={setEntryHeight}
          />
        )}
      </View>

      <AddTracksSheet
        visible={adding}
        onAdd={onAddTracks}
        onClose={() => setAdding(false)}
      />

      <NamePlaylistDialog
        visible={renaming}
        title={t('playlists.rename')}
        initialName={playlist?.name ?? ''}
        onCancel={() => setRenaming(false)}
        onSubmit={onRename}
      />
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
