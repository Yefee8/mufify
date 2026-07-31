import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import {
  ChevronDown,
  Music,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
} from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

import { EmptyState } from '@/components/ui/EmptyState';
import { AudioEngine } from '@/services/audio/AudioEngine';
import { cycleRepeat } from '@/services/audio/queue';
import { getShuffleAlgorithm } from '@/services/settings';
import type { RepeatMode } from '@/services/audio/types';
import { formatDuration } from '@/services/format/duration';
import { useThemeColors } from '@/theme/useTheme';

import { Scrubber } from './components/Scrubber';
import { SpecStrip } from './components/SpecStrip';
import { usePlayback, usePlaybackControls } from './hooks/usePlayback';

/**
 * Now Playing.
 *
 * A modal route rather than a tab: it is a place you go from something, and
 * you leave it by dismissing rather than by choosing a different destination.
 */
export function PlayerScreen() {
  const { t, i18n } = useTranslation();
  const colors = useThemeColors();
  const router = useRouter();

  const { phase, track, positionMs, durationMs, error } = usePlayback();
  const { toggle, toggleShuffle, next, previous, seekTo } = usePlaybackControls();
  const [repeat, setRepeatState] = useState<RepeatMode>(() => AudioEngine.getRepeat());
  const [shuffled, setShuffledState] = useState(() => AudioEngine.isShuffled());

  const close = useCallback(() => router.back(), [router]);

  const onShufflePress = useCallback(() => {
    toggleShuffle();
    setShuffledState(AudioEngine.isShuffled());
  }, [toggleShuffle]);

  const onRepeatPress = useCallback(() => {
    const nextMode = cycleRepeat(repeat);
    AudioEngine.setRepeat(nextMode);
    setRepeatState(nextMode);
  }, [repeat]);

  if (track === null) {
    return (
      <View className="flex-1 bg-surface">
        <Header onClose={close} label={t('player.title')} />
        <EmptyState icon={Music} messages={[t('player.empty')]} />
      </View>
    );
  }

  const isPlaying = phase === 'playing';
  const isLoading = phase === 'loading';
  const algorithm = getShuffleAlgorithm();
  const artworkUri = track.artworkPath ? `file://${track.artworkPath}` : null;
  const RepeatIcon = repeat === 'one' ? Repeat1 : Repeat;

  return (
    <View className="flex-1 bg-surface">
      <Header onClose={close} label={t('player.title')} />

      <View className="flex-1 justify-center gap-8 px-6">
        <View className="aspect-square w-full items-center justify-center rounded-md bg-surface-elevated">
          {artworkUri ? (
            <Image
              source={{ uri: artworkUri }}
              recyclingKey={String(track.id)}
              cachePolicy="memory-disk"
              contentFit="cover"
              className="h-full w-full rounded-md"
            />
          ) : (
            <Music color={colors.legend} size={64} strokeWidth={1} />
          )}
        </View>

        <View className="gap-2">
          <Text numberOfLines={2} className="font-display text-3xl text-primary">
            {track.title}
          </Text>
          <Text numberOfLines={1} className="font-body text-base text-muted">
            {track.artistName ?? t('player.unknownArtist')}
          </Text>
          <SpecStrip trackId={track.id} />
        </View>

        {phase === 'error' ? (
          <Text className="font-body text-sm text-muted">
            {t('player.error')}
            {error ? ` ${error}` : ''}
          </Text>
        ) : (
          <View className="gap-2">
            <Scrubber
              positionMs={positionMs}
              durationMs={durationMs}
              onSeek={seekTo}
              accessibilityLabel={t('player.seek')}
            />
            <View className="flex-row justify-between">
              <Text className="font-mono text-sm text-muted">
                {formatDuration(positionMs, i18n.language)}
              </Text>
              <Text className="font-mono text-sm text-muted">
                {formatDuration(durationMs, i18n.language)}
              </Text>
            </View>
          </View>
        )}

        <View className="flex-row items-center justify-between">
          <Pressable
            onPress={onRepeatPress}
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
            onPress={previous}
            accessibilityRole="button"
            accessibilityLabel={t('player.previous')}
            className="min-h-11 min-w-11 items-center justify-center"
          >
            <SkipBack color={colors.label} size={28} strokeWidth={2} fill={colors.label} />
          </Pressable>

          {/* The only circular control in the app, per the design direction. */}
          <Pressable
            onPress={toggle}
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
            onPress={next}
            accessibilityRole="button"
            accessibilityLabel={t('player.next')}
            className="min-h-11 min-w-11 items-center justify-center"
          >
            <SkipForward color={colors.label} size={28} strokeWidth={2} fill={colors.label} />
          </Pressable>

          <Pressable
            onPress={onShufflePress}
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
      </View>
    </View>
  );
}

interface HeaderProps {
  onClose: () => void;
  label: string;
}

function Header({ onClose, label }: HeaderProps) {
  const colors = useThemeColors();
  const { t } = useTranslation();

  return (
    <View className="flex-row items-center justify-between px-6 pt-6">
      <Pressable
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel={t('player.close')}
        className="min-h-11 min-w-11 items-center justify-start"
      >
        <ChevronDown color={colors.label} size={26} strokeWidth={2} />
      </Pressable>
      <Text className="font-body-medium text-sm text-muted">{label}</Text>
      <View className="min-h-11 min-w-11" />
    </View>
  );
}
