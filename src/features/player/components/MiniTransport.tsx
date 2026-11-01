import { Pause, Play, SkipBack, SkipForward } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { useThemeColors } from '@/theme/useTheme';

export interface MiniTransportProps {
  isPlaying: boolean;
  onPrevious: () => void;
  onToggle: () => void;
  onNext: () => void;
}

/**
 * Previous, play/pause and next, for the strip above the tab bar.
 *
 * Its own component because it is the half of the mini player that does *not*
 * move: the track's artwork and title slide away when you swipe, and these
 * three stay exactly where they are. Keeping them out of the animated subtree
 * is the point, so keeping them out of the file makes that hard to undo by
 * accident.
 *
 * Previous belongs here as much as next does. Skipping back is the commonest
 * correction there is — you skip one too many and want it back — and a strip
 * with only "next" was a one-way control.
 */
export function MiniTransport({ isPlaying, onPrevious, onToggle, onNext }: MiniTransportProps) {
  const { t } = useTranslation();
  const colors = useThemeColors();

  return (
    <View className="flex-row items-center">
      <Pressable
        onPress={onPrevious}
        android_ripple={{ color: colors.etch, borderless: true }}
        accessibilityRole="button"
        accessibilityLabel={t('player.previous')}
        className="min-h-11 min-w-11 items-center justify-center"
      >
        <SkipBack color={colors.label} size={20} strokeWidth={2} fill={colors.label} />
      </Pressable>

      <Pressable
        onPress={onToggle}
        android_ripple={{ color: colors.etch, borderless: true }}
        accessibilityRole="button"
        accessibilityLabel={isPlaying ? t('player.pause') : t('player.play')}
        className="min-h-11 min-w-11 items-center justify-center"
      >
        {isPlaying ? (
          <Pause color={colors.label} size={22} strokeWidth={2} fill={colors.label} />
        ) : (
          <Play color={colors.label} size={22} strokeWidth={2} fill={colors.label} />
        )}
      </Pressable>

      <Pressable
        onPress={onNext}
        android_ripple={{ color: colors.etch, borderless: true }}
        accessibilityRole="button"
        accessibilityLabel={t('player.next')}
        className="min-h-11 min-w-11 items-center justify-center"
      >
        <SkipForward color={colors.label} size={20} strokeWidth={2} fill={colors.label} />
      </Pressable>
    </View>
  );
}
