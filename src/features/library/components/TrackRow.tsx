import { Image } from 'expo-image';
import { Music } from 'lucide-react-native';
import { memo, useCallback } from 'react';
import { Pressable, Text, View } from 'react-native';

import type { TrackListItem } from '@/db/queries/tracks';
import { formatDuration } from '@/services/format/duration';
import { useThemeColors } from '@/theme/useTheme';

export interface TrackRowProps {
  track: TrackListItem;
  /** Locale tag for the duration. Passed down so the row does no i18n lookup. */
  locale: string;
  /** Stable across renders — an inline arrow here would defeat the memo. */
  onPress: (id: number) => void;
  /** Long press opens the track's actions. Also stable. */
  onLongPress: (id: number) => void;
}

/**
 * One track: artwork, title, artist — album, duration.
 *
 * Memoized, and it has to stay that way. A 10,000-row list re-rendering every
 * visible row on each parent render is the difference between a list that
 * scrolls and one that does not.
 */
export const TrackRow = memo(function TrackRow({
  track,
  locale,
  onPress,
  onLongPress,
}: TrackRowProps) {
  const colors = useThemeColors();
  const handlePress = useCallback(() => onPress(track.id), [onPress, track.id]);
  const handleLongPress = useCallback(() => onLongPress(track.id), [onLongPress, track.id]);

  // Artwork paths are stored bare, without a scheme, because that is what the
  // Kotlin side writes and what it hands back. expo-image needs the scheme.
  const artworkUri = track.artworkPath ? `file://${track.artworkPath}` : null;

  const subtitle = [track.artistName, track.albumName].filter(Boolean).join(' — ');

  return (
    <Pressable
      onPress={handlePress}
      onLongPress={handleLongPress}
      accessibilityRole="button"
      accessibilityLabel={track.title}
      accessibilityHint={subtitle || undefined}
      className="h-16 flex-row items-center gap-3 px-6"
    >
      {artworkUri ? (
        <Image
          source={{ uri: artworkUri }}
          // Recycling key and cache policy are both required by AGENTS.md: the
          // key stops a recycled row showing the previous track's cover for a
          // frame, and the artwork is already on disk so memory-only caching
          // would re-decode it on every pass.
          recyclingKey={String(track.id)}
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
          {track.title}
        </Text>
        {subtitle ? (
          <Text numberOfLines={1} className="font-body text-sm text-muted">
            {subtitle}
          </Text>
        ) : null}
      </View>

      {/* Mono for every technical value, so durations align down the column. */}
      <Text className="font-mono text-sm text-muted">
        {formatDuration(track.durationMs, locale)}
      </Text>
    </Pressable>
  );
});
