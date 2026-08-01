import { Image } from 'expo-image';
import { Disc3, User } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { useThemeColors } from '@/theme/useTheme';

export interface CollectionHeaderProps {
  kind: 'artist' | 'album';
  name: string;
  /** The album's artist. Null for an artist. */
  subtitle: string | null;
  trackCount: number;
  artworkPath: string | null;
}

/** Cover, name and size for an artist or album detail screen. */
export function CollectionHeader({
  kind,
  name,
  subtitle,
  trackCount,
  artworkPath,
}: CollectionHeaderProps) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const Icon = kind === 'artist' ? User : Disc3;

  return (
    <View className="flex-row items-end gap-4 px-6 pb-4">
      {artworkPath ? (
        <Image
          source={{ uri: `file://${artworkPath}` }}
          recyclingKey={`${kind}-${name}`}
          cachePolicy="memory-disk"
          contentFit="cover"
          transition={0}
          className="aspect-square w-1/3 rounded-xs"
        />
      ) : (
        <View className="aspect-square w-1/3 items-center justify-center rounded-xs bg-surface-elevated">
          <Icon color={colors.legend} size={40} strokeWidth={1.5} />
        </View>
      )}

      <View className="flex-1 gap-1 pb-1">
        <Text numberOfLines={2} className="font-display text-2xl text-primary">
          {name}
        </Text>
        {subtitle ? (
          <Text numberOfLines={1} className="font-body text-sm text-muted">
            {subtitle}
          </Text>
        ) : null}
        <Text className="font-mono text-sm text-muted">
          {t('library.trackCount', { count: trackCount })}
        </Text>
      </View>
    </View>
  );
}
