import { Image } from 'expo-image';
import { ListMusic } from 'lucide-react-native';
import { memo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

import type { PlaylistSummary } from '@/db/queries/playlists';
import { useThemeColors } from '@/theme/useTheme';

export interface PlaylistRowProps {
  playlist: PlaylistSummary;
  onPress: (id: number) => void;
}

/** One playlist: cover of its first track, name, size. */
export const PlaylistRow = memo(function PlaylistRow({ playlist, onPress }: PlaylistRowProps) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const handlePress = useCallback(() => onPress(playlist.id), [onPress, playlist.id]);

  const artworkUri = playlist.artworkPath ? `file://${playlist.artworkPath}` : null;

  return (
    <Pressable
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={playlist.name}
      accessibilityHint={t('playlists.trackCount', { count: playlist.trackCount })}
      className="h-16 flex-row items-center gap-3 px-6"
    >
      {artworkUri ? (
        <Image
          source={{ uri: artworkUri }}
          recyclingKey={String(playlist.id)}
          cachePolicy="memory-disk"
          contentFit="cover"
          className="h-10 w-10 rounded-xs"
        />
      ) : (
        <View className="h-10 w-10 items-center justify-center rounded-xs bg-surface-elevated">
          <ListMusic color={colors.legend} size={18} strokeWidth={2} />
        </View>
      )}

      <View className="flex-1">
        <Text numberOfLines={1} className="font-body text-base text-primary">
          {playlist.name}
        </Text>
        <Text className="font-body text-sm text-muted">
          {t('playlists.trackCount', { count: playlist.trackCount })}
        </Text>
      </View>
    </Pressable>
  );
});
