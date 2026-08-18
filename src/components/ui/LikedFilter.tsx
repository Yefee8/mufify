import { Heart } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Pressable } from 'react-native';

import { useThemeColors } from '@/theme/useTheme';

export interface LikedFilterProps {
  active: boolean;
  onChange: (active: boolean) => void;
  /** Names what is being narrowed — tracks or playlists — for screen readers. */
  accessibilityLabel: string;
}

/**
 * Narrow a list to the liked things in it.
 *
 * A heart that stays lit rather than a chip with a word on it: the same icon
 * already means "liked" on a track row, in the player and in the action sheet,
 * so a second visual vocabulary for the same idea would be one to learn for
 * nothing. Filled means the filter is on, which is the same rule the track
 * heart follows.
 *
 * **It renders whether or not the filtered list has anything in it.** This is
 * the one thing worth being careful about here: the control that turns a filter
 * on has to be the control that turns it off, and a filter chip that hides
 * itself alongside an empty result strands the user in a list that appears to
 * have lost their music. `PlayShuffleBar` next to it *does* hide when there is
 * nothing to play, which is why the two are not in the same row.
 */
export function LikedFilter({ active, onChange, accessibilityLabel }: LikedFilterProps) {
  const { t } = useTranslation();
  const colors = useThemeColors();

  return (
    <Pressable
      onPress={() => onChange(!active)}
      accessibilityRole="switch"
      accessibilityState={{ checked: active }}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={t('common.likedOnly')}
      android_ripple={{ color: colors.etch, radius: 24 }}
      className={
        active
          ? 'min-h-11 min-w-11 items-center justify-center rounded-sm bg-accent px-3'
          : 'min-h-11 min-w-11 items-center justify-center rounded-sm border border-subtle px-3'
      }
    >
      <Heart
        color={active ? colors.onSignal : colors.legend}
        fill={active ? colors.onSignal : 'transparent'}
        size={18}
        strokeWidth={2}
      />
    </Pressable>
  );
}
