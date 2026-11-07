import { Pause, Play, Repeat, Repeat1, Shuffle, SkipBack, SkipForward } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import type { PlaybackPhase, RepeatMode } from '@/services/audio/types';
import { getShuffleAlgorithm } from '@/services/settings';
import { useThemeColors } from '@/theme/useTheme';

export interface PlayerTransportProps {
  phase: PlaybackPhase;
  repeat: RepeatMode;
  shuffled: boolean;
  onRepeat: () => void;
  onPrevious: () => void;
  onToggle: () => void;
  onNext: () => void;
  onShuffle: () => void;
}

/** Repeat, previous, play/pause, next, shuffle — Now Playing's transport row. */
export function PlayerTransport({
  phase,
  repeat,
  shuffled,
  onRepeat,
  onPrevious,
  onToggle,
  onNext,
  onShuffle,
}: PlayerTransportProps) {
  const { t } = useTranslation();
  const colors = useThemeColors();

  const isPlaying = phase === 'playing';
  const isLoading = phase === 'loading';
  const algorithm = getShuffleAlgorithm();
  const RepeatIcon = repeat === 'one' ? Repeat1 : Repeat;

  return (
    <View className="flex-row items-center justify-between px-6">
      <Pressable
        onPress={onRepeat}
        accessibilityRole="button"
        accessibilityLabel={t(`player.repeat.${repeat}`)}
        accessibilityState={{ selected: repeat !== 'off' }}
        className="min-h-11 min-w-11 items-center justify-center"
      >
        <RepeatIcon
          color={repeat === 'off' ? colors.legend : colors.signal}
          size={22}
          strokeWidth={2}
        />
      </Pressable>

      <Pressable
        onPress={onPrevious}
        accessibilityRole="button"
        accessibilityLabel={t('player.previous')}
        className="min-h-11 min-w-11 items-center justify-center"
      >
        <SkipBack color={colors.label} size={28} strokeWidth={2} fill={colors.label} />
      </Pressable>

      {/* The only circular control in the app, per the design direction. */}
      <Pressable
        onPress={onToggle}
        disabled={isLoading}
        accessibilityRole="button"
        accessibilityLabel={isPlaying ? t('player.pause') : t('player.play')}
        accessibilityState={{ disabled: isLoading, selected: isPlaying }}
        className="h-16 w-16 items-center justify-center rounded-full bg-accent"
      >
        {isPlaying ? (
          <Pause color={colors.onSignal} size={28} strokeWidth={2} fill={colors.onSignal} />
        ) : (
          <Play color={colors.onSignal} size={28} strokeWidth={2} fill={colors.onSignal} />
        )}
      </Pressable>

      <Pressable
        onPress={onNext}
        accessibilityRole="button"
        accessibilityLabel={t('player.next')}
        className="min-h-11 min-w-11 items-center justify-center"
      >
        <SkipForward color={colors.label} size={28} strokeWidth={2} fill={colors.label} />
      </Pressable>

      <Pressable
        onPress={onShuffle}
        accessibilityRole="button"
        /* Names the algorithm, not just "shuffle" — the brief asks for
           several and the indicator has to say which one is running. */
        accessibilityLabel={
          shuffled
            ? t('player.shuffle.on', { algorithm: t(`settings.shuffle.${algorithm}`) })
            : t('player.shuffle.off')
        }
        accessibilityState={{ selected: shuffled }}
        className="min-h-11 min-w-11 items-center justify-center"
      >
        <Shuffle color={shuffled ? colors.signal : colors.legend} size={22} strokeWidth={2} />
      </Pressable>
    </View>
  );
}
