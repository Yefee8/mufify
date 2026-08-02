import { Image } from 'expo-image';
import { Music, X } from 'lucide-react-native';
import { memo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

import type { PlaylistEntry } from '@/db/queries/playlists';
import { formatDuration } from '@/services/format/duration';
import { useThemeColors } from '@/theme/useTheme';

export interface PlaylistEntryRowProps {
  entry: PlaylistEntry;
  locale: string;
  onPress: (position: number) => void;
  onRemove?: (position: number) => void;
}

/**
 * A track inside a playlist.
 *
 * Keyed and acted on by `position`, not track id: the same track may appear
 * twice, and removing "the track" would take both.
 */
export const PlaylistEntryRow = memo(function PlaylistEntryRow({
  entry,
  locale,
  onPress,
  onRemove,
}: PlaylistEntryRowProps) {
  const { t } = useTranslation();
  const colors = useThemeColors();

  const handlePress = useCallback(() => onPress(entry.position), [onPress, entry.position]);
  const handleRemove = useCallback(() => onRemove?.(entry.position), [onRemove, entry.position]);

  const artworkUri = entry.artworkPath ? `file://${entry.artworkPath}` : null;
  const subtitle = [
    entry.artistName ?? t('common.unknownArtist'),
    entry.albumName ?? t('common.unknownAlbum'),
  ].join(' — ');

  return (
    <View className="h-16 flex-row items-center gap-3 pl-6 pr-2">
      <Pressable
        onPress={handlePress}
        accessibilityRole="button"
        accessibilityLabel={entry.title}
        accessibilityHint={subtitle || undefined}
        className="h-16 flex-1 flex-row items-center gap-3"
      >
        {artworkUri ? (
          <Image
            source={{ uri: artworkUri }}
            recyclingKey={`${entry.trackId}-${entry.position}`}
            cachePolicy="memory-disk"
            contentFit="cover"
            className="h-10 w-10 rounded-xs"
          />
        ) : (
          <View className="h-10 w-10 items-center justify-center rounded-xs bg-surface-elevated">
            <Music color={colors.legend} size={18} strokeWidth={2} />
          </View>
        )}

        <View className="flex-1">
          <Text numberOfLines={1} className="font-body text-base text-primary">
            {entry.title}
          </Text>
          {subtitle ? (
            <Text numberOfLines={1} className="font-body text-sm text-muted">
              {subtitle}
            </Text>
          ) : null}
        </View>

        <Text className="font-mono text-sm text-muted">
          {formatDuration(entry.durationMs, locale)}
        </Text>
      </Pressable>

      {onRemove ? (
        <Pressable
          onPress={handleRemove}
          accessibilityRole="button"
          accessibilityLabel={t('playlists.removeTrack', { title: entry.title })}
          className="min-h-11 min-w-11 items-center justify-center"
        >
          <X color={colors.legend} size={18} strokeWidth={2} />
        </Pressable>
      ) : null}
    </View>
  );
});
