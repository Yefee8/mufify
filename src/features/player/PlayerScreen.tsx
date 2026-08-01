import { useRouter } from 'expo-router';
import {
  ChevronDown,
  ListMusic,
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

import { ArtworkCarousel } from './components/ArtworkCarousel';
import { FavoriteButton } from './components/FavoriteButton';
import { Scrubber } from './components/Scrubber';
import { SpecStrip } from './components/SpecStrip';
import { usePlayback, usePlaybackControls } from './hooks/usePlayback';
import { useQueueNeighbours } from './hooks/useQueueNeighbours';

/**
 * Now Playing.
 *
 * The root player overlay rather than a route. It stays mounted above every
 * screen so the mini player and this surface share one gesture progress value.
 */
export interface PlayerScreenProps {
  onExpandedChange: (expanded: boolean) => void;
}

export function PlayerScreen({ onExpandedChange }: PlayerScreenProps) {
  const { t, i18n } = useTranslation();
  const colors = useThemeColors();
  const router = useRouter();

  const { phase, track, positionMs, durationMs, error } = usePlayback();
  const { toggle, toggleShuffle, next, previous, seekTo } = usePlaybackControls();
  const neighbours = useQueueNeighbours();
  const [repeat, setRepeatState] = useState<RepeatMode>(() => AudioEngine.getRepeat());
  const [shuffled, setShuffledState] = useState(() => AudioEngine.isShuffled());

  const close = useCallback(() => onExpandedChange(false), [onExpandedChange]);
  // A double press must not leave two identical queue screens on the stack.
  const openQueue = useCallback(() => router.navigate('/queue'), [router]);

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
        <Header onClose={close} onOpenQueue={openQueue} label={t('player.title')} />
        <EmptyState icon={Music} messages={[t('player.empty')]} />
      </View>
    );
  }

  const isPlaying = phase === 'playing';
  const isLoading = phase === 'loading';
  const algorithm = getShuffleAlgorithm();
  const RepeatIcon = repeat === 'one' ? Repeat1 : Repeat;

  return (
    <View className="flex-1 bg-surface">
      <Header onClose={close} onOpenQueue={openQueue} label={t('player.title')} />

      <View className="flex-1 justify-center gap-8">
        {/*
          The artwork carries the gestures, not the whole screen: the scrubber
          below owns a pan of its own, and two competing pans on one surface
          means a scrub that sometimes dismisses the screen instead.

          Down dismisses, which is what the brief asks for and what Android's
          modal presentation does not give on its own. Sideways moves through the
          queue with the neighbouring covers already on screen.
        */}
        <ArtworkCarousel
          neighbours={neighbours}
          onNext={next}
          onPrevious={previous}
          onExpandedChange={onExpandedChange}
        />

        <View className="gap-2 px-6">
          <Text numberOfLines={2} className="font-display text-3xl text-primary">
            {track.title}
          </Text>
          <View className="flex-row items-center justify-between">
            <Text numberOfLines={1} className="flex-1 font-body text-base text-muted">
              {track.artistName ?? t('common.unknownArtist')}
            </Text>
            <FavoriteButton trackId={track.id} />
          </View>
          <SpecStrip trackId={track.id} />
        </View>

        {phase === 'error' ? (
          <Text className="px-6 font-body text-sm text-muted">
            {t('player.error')}
            {error ? ` ${error}` : ''}
          </Text>
        ) : (
          <View className="gap-2 px-6">
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

        <View className="flex-row items-center justify-between px-6">
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
  onOpenQueue: () => void;
  label: string;
}

function Header({ onClose, onOpenQueue, label }: HeaderProps) {
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
      <Pressable
        onPress={onOpenQueue}
        accessibilityRole="button"
        accessibilityLabel={t('queue.title')}
        className="min-h-11 min-w-11 items-center justify-center"
      >
        <ListMusic color={colors.label} size={22} strokeWidth={2} />
      </Pressable>
    </View>
  );
}
