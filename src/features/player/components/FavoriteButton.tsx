import { Heart } from 'lucide-react-native';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable } from 'react-native';

import { setFavorite, useIsFavorite } from '@/db/queries/tracks';
import { tapFeedback } from '@/services/haptics';
import { useThemeColors } from '@/theme/useTheme';

export interface FavoriteButtonProps {
  trackId: number;
}

/**
 * The favourite toggle.
 *
 * It exists partly for its own sake and partly because the `favorites` shuffle
 * weights on `is_favorite` — before this, that column had no writer and the
 * algorithm was quietly running on play counts alone.
 *
 * Filled when set, outlined when not: a heart that only changes colour reads as
 * disabled rather than as off.
 */
export function FavoriteButton({ trackId }: FavoriteButtonProps) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const isFavorite = useIsFavorite(trackId);

  const onPress = useCallback(() => {
    tapFeedback();
    void setFavorite(trackId, !isFavorite);
  }, [trackId, isFavorite]);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={isFavorite ? t('player.unfavorite') : t('player.favorite')}
      accessibilityState={{ selected: isFavorite }}
      className="min-h-11 min-w-11 items-center justify-center"
    >
      <Heart
        color={isFavorite ? colors.signal : colors.legend}
        fill={isFavorite ? colors.signal : 'transparent'}
        size={22}
        strokeWidth={2}
      />
    </Pressable>
  );
}
