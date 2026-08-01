import { Image } from 'expo-image';
import type { LucideIcon } from 'lucide-react-native';
import { memo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

import type { CollectionCard as Card } from '@/db/queries/tracks';
import { useThemeColors } from '@/theme/useTheme';

export interface CollectionCardProps {
  kind: 'artist' | 'album';
  card: Card;
  /** Drawn when there is no cover. A disc for albums, a person for artists. */
  icon: LucideIcon;
  onPress: (id: number) => void;
}

/**
 * One artist or album: cover, name, and how much of it there is.
 *
 * A square rather than a row, because a grid of covers is the one place this
 * app lets artwork carry a screen — the design direction says album art is the
 * only saturated colour in most views and should be allowed to. Track lists
 * stay as rows; this is the shelf.
 *
 * `rounded-xs` on the cover, matching every other piece of list artwork. The
 * radius scale reserves `md` for cards and sheets, and using it here would make
 * the covers rounder than the panel they sit on.
 */
const CollectionCardComponent = function CollectionCard({
  kind,
  card,
  icon: Icon,
  onPress,
}: CollectionCardProps) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const handlePress = useCallback(() => onPress(card.id), [onPress, card.id]);

  const name = card.isUnknown
    ? t(kind === 'artist' ? 'common.unknownArtist' : 'common.unknownAlbum')
    : card.name ?? t(kind === 'artist' ? 'common.unknownArtist' : 'common.unknownAlbum');
  const subtitle = card.isUnknown
    ? t('library.trackCount', { count: card.trackCount })
    : card.isUnknownSubtitle
      ? t('common.unknownArtist')
      : card.subtitle ?? t('library.trackCount', { count: card.trackCount });

  return (
    <Pressable
      onPress={handlePress}
      android_ripple={{ color: colors.etch }}
      accessibilityRole="button"
      accessibilityLabel={name}
      accessibilityHint={t('library.trackCount', { count: card.trackCount })}
      className="w-full gap-2"
    >
      {card.artworkPath ? (
        <Image
          source={{ uri: `file://${card.artworkPath}` }}
          recyclingKey={String(card.id)}
          cachePolicy="memory-disk"
          contentFit="cover"
          transition={0}
          className="aspect-square w-full rounded-xs"
        />
      ) : (
        <View className="aspect-square w-full items-center justify-center rounded-xs bg-surface-elevated">
          <Icon color={colors.legend} size={32} strokeWidth={1.5} />
        </View>
      )}

      <View>
        <Text numberOfLines={1} className="font-body text-base text-primary">
          {name}
        </Text>
        <Text numberOfLines={1} className="font-body text-sm text-muted">
          {subtitle}
        </Text>
      </View>
    </Pressable>
  );
};

function isSameCard(previous: CollectionCardProps, next: CollectionCardProps): boolean {
  return (
    previous.kind === next.kind &&
    previous.onPress === next.onPress &&
    previous.icon === next.icon &&
    previous.card.id === next.card.id &&
    previous.card.name === next.card.name &&
    previous.card.subtitle === next.card.subtitle &&
    previous.card.isUnknown === next.card.isUnknown &&
    previous.card.isUnknownSubtitle === next.card.isUnknownSubtitle &&
    previous.card.trackCount === next.card.trackCount &&
    previous.card.artworkPath === next.card.artworkPath
  );
}

export const CollectionCard = memo(CollectionCardComponent, isSameCard);
