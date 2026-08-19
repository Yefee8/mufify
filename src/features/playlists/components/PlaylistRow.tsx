import { Heart } from 'lucide-react-native';
import { memo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

import type { PlaylistSummary } from '@/db/queries/playlists';
import { useThemeColors } from '@/theme/useTheme';

import { PlaylistMosaic } from './PlaylistMosaic';

export interface PlaylistRowProps {
  playlist: PlaylistSummary;
  onPress: (id: number) => void;
}

/** One playlist: its chosen cover or a mosaic of its first four, name, size. */
export const PlaylistRow = memo(function PlaylistRow({ playlist, onPress }: PlaylistRowProps) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const handlePress = useCallback(() => onPress(playlist.id), [onPress, playlist.id]);

  return (
    <Pressable
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={playlist.name}
      accessibilityHint={t('playlists.trackCount', { count: playlist.trackCount })}
      className="h-16 flex-row items-center gap-3 px-6"
    >
      {/* `cover` as well as `covers`. Without it the list drew the mosaic for a
          playlist that had a picture chosen — the detail screen showed the
          picture, the row it came from did not, and nothing would ever make
          them agree because the row was never told there was one. */}
      <PlaylistMosaic covers={playlist.mosaic} cover={playlist.coverPath} />

      <View className="flex-1">
        <Text numberOfLines={1} className="font-body text-base text-primary">
          {playlist.name}
        </Text>
        <Text className="font-body text-sm text-muted">
          {t('playlists.trackCount', { count: playlist.trackCount })}
        </Text>
      </View>

      {/* Why this row is above the others. Not a button — the row's whole job is
          to open the playlist, and a target inside it that does something else
          is how you like a playlist while trying to open it. The toggle lives
          inside, in the header. */}
      {playlist.isFavorite ? (
        <Heart color={colors.signal} fill={colors.signal} size={16} strokeWidth={2} />
      ) : null}
    </Pressable>
  );
});
