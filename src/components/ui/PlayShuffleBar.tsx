import { Play, Shuffle } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

import { useThemeColors } from '@/theme/useTheme';

export interface PlayShuffleBarProps {
  onPlay: () => void;
  onShuffle: () => void;
  /** Nothing to play. The pair is hidden rather than shown dead. */
  disabled?: boolean;
}

/**
 * Play and Shuffle, side by side, above a list of tracks.
 *
 * The playlist screen had this from the start and nothing else did, so the
 * library and an album were lists you could only start by picking a row —
 * which starts at that row, not at the top. Two buttons is the arrangement
 * everyone's hands already know.
 *
 * Shuffle is a peer of Play rather than a modifier on it: the app has five
 * shuffle algorithms and the one in Settings applies here, so "shuffle this"
 * is a real second way to start.
 *
 * Hidden when there is nothing to play. Two dead buttons above an empty state
 * are noise, and the empty state already says what to do instead.
 */
export function PlayShuffleBar({ onPlay, onShuffle, disabled = false }: PlayShuffleBarProps) {
  const { t } = useTranslation();
  const colors = useThemeColors();

  if (disabled) return null;

  return (
    <View className="flex-row gap-3 px-6 pb-4">
      <Pressable
        onPress={onPlay}
        accessibilityRole="button"
        accessibilityLabel={t('common.playAll')}
        className="min-h-11 flex-1 flex-row items-center justify-center gap-2 rounded-sm bg-accent px-4"
      >
        <Play color={colors.onSignal} size={18} strokeWidth={2} fill={colors.onSignal} />
        <Text className="font-body-medium text-base text-on-accent">{t('common.playAll')}</Text>
      </Pressable>

      <Pressable
        onPress={onShuffle}
        accessibilityRole="button"
        accessibilityLabel={t('common.shuffle')}
        className="min-h-11 flex-1 flex-row items-center justify-center gap-2 rounded-sm border border-subtle px-4"
      >
        <Shuffle color={colors.label} size={18} strokeWidth={2} />
        <Text className="font-body-medium text-base text-primary">{t('common.shuffle')}</Text>
      </Pressable>
    </View>
  );
}
