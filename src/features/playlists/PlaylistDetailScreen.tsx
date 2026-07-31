import { FlashList, type ListRenderItem } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { ChevronLeft, ListMusic, Pencil, Play, Trash2 } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EmptyState } from '@/components/ui/EmptyState';
import {
  deletePlaylist,
  removeFromPlaylist,
  renamePlaylist,
  usePlaylistEntries,
  usePlaylists,
  type PlaylistEntry,
} from '@/db/queries/playlists';
import { useMessages } from '@/i18n';
import { useThemeColors } from '@/theme/useTheme';

import { usePlaybackControls } from '../player/hooks/usePlayback';
import { NamePlaylistDialog } from './components/NamePlaylistDialog';
import { PlaylistEntryRow } from './components/PlaylistEntryRow';

export interface PlaylistDetailScreenProps {
  playlistId: number;
}

/** One playlist: its tracks, in order, with the way to play and edit them. */
export function PlaylistDetailScreen({ playlistId }: PlaylistDetailScreenProps) {
  const { t, i18n } = useTranslation();
  const colors = useThemeColors();
  const router = useRouter();
  const messages = useMessages('playlists.detailEmpty');

  const entries = usePlaylistEntries(playlistId);
  const playlist = usePlaylists().find((entry) => entry.id === playlistId);
  const { playFrom } = usePlaybackControls();
  const [renaming, setRenaming] = useState(false);

  const goBack = useCallback(() => router.back(), [router]);

  const playAll = useCallback(() => {
    if (entries.length > 0) playFrom(entries.map(toPlayableEntry), 0);
  }, [entries, playFrom]);

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

  const onRename = useCallback(
    (name: string) => {
      setRenaming(false);
      void renamePlaylist(playlistId, name);
    },
    [playlistId],
  );

  const onDelete = useCallback(() => {
    // Leave first: deleting under the screen would leave it rendering a
    // playlist that no longer exists for a frame.
    router.back();
    void deletePlaylist(playlistId);
  }, [router, playlistId]);

  const renderItem = useCallback<ListRenderItem<PlaylistEntry>>(
    ({ item }) => (
      <PlaylistEntryRow
        entry={item}
        locale={i18n.language}
        onPress={playAt}
        onRemove={remove}
      />
    ),
    [i18n.language, playAt, remove],
  );

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-surface">
      <View className="flex-row items-center gap-2 px-4 pt-6">
        <Pressable
          onPress={goBack}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          className="min-h-11 min-w-11 items-center justify-center"
        >
          <ChevronLeft color={colors.label} size={26} strokeWidth={2} />
        </Pressable>

        <Text numberOfLines={1} className="flex-1 font-display text-2xl text-primary">
          {playlist?.name ?? ''}
        </Text>

        <Pressable
          onPress={() => setRenaming(true)}
          accessibilityRole="button"
          accessibilityLabel={t('playlists.rename')}
          className="min-h-11 min-w-11 items-center justify-center"
        >
          <Pencil color={colors.legend} size={20} strokeWidth={2} />
        </Pressable>

        <Pressable
          onPress={onDelete}
          accessibilityRole="button"
          accessibilityLabel={t('playlists.delete')}
          className="min-h-11 min-w-11 items-center justify-center"
        >
          <Trash2 color={colors.legend} size={20} strokeWidth={2} />
        </Pressable>
      </View>

      <View className="flex-row items-center justify-between px-6 py-4">
        <Text className="font-mono text-sm text-muted">
          {t('playlists.trackCount', { count: entries.length })}
        </Text>

        {entries.length > 0 ? (
          <Pressable
            onPress={playAll}
            accessibilityRole="button"
            accessibilityLabel={t('playlists.playAll')}
            className="min-h-11 flex-row items-center gap-2 rounded-sm border border-subtle px-4"
          >
            <Play color={colors.signal} size={18} strokeWidth={2} fill={colors.signal} />
            <Text className="font-body-medium text-sm text-accent">{t('playlists.playAll')}</Text>
          </Pressable>
        ) : null}
      </View>

      {entries.length === 0 ? (
        <EmptyState icon={ListMusic} messages={messages} />
      ) : (
        <FlashList data={entries} renderItem={renderItem} keyExtractor={keyExtractor} />
      )}

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

/** A playlist entry as the engine wants it. */
function toPlayableEntry(entry: PlaylistEntry) {
  return {
    id: entry.trackId,
    uri: entry.fileUri,
    title: entry.title,
    artistName: entry.artistName,
    albumName: entry.albumName,
    durationMs: entry.durationMs,
    artworkPath: entry.artworkPath,
    playCount: entry.playCount,
  };
}
