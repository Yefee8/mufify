import { memo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

import type { PlaylistSummary } from '@/db/queries/playlists';

import { PlaylistMosaic } from './PlaylistMosaic';

export interface PlaylistRowProps {
  playlist: PlaylistSummary;
  onPress: (id: number) => void;
}

/** One playlist: a mosaic of its first four covers, name, size. */
export const PlaylistRow = memo(function PlaylistRow({ playlist, onPress }: PlaylistRowProps) {
  const { t } = useTranslation();
  const handlePress = useCallback(() => onPress(playlist.id), [onPress, playlist.id]);

  return (
    <Pressable
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={playlist.name}
      accessibilityHint={t('playlists.trackCount', { count: playlist.trackCount })}
      className="h-16 flex-row items-center gap-3 px-6"
    >
      <PlaylistMosaic covers={playlist.mosaic} />

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
