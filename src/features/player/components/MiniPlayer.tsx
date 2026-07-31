import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Music, Pause, Play, SkipForward } from 'lucide-react-native';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

import { useThemeColors } from '@/theme/useTheme';

import { usePlayback, usePlaybackControls } from '../hooks/usePlayback';

/**
 * The persistent transport strip above the tab bar.
 *
 * Renders nothing at all when idle rather than sitting there empty — a dead
 * strip on a fresh install is clutter, and the tab bar should meet the list
 * until there is something playing.
 */
export function MiniPlayer() {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const router = useRouter();
  const { phase, track, positionMs, durationMs } = usePlayback();
  const { toggle, next } = usePlaybackControls();

  const openPlayer = useCallback(() => router.push('/player'), [router]);

  if (phase === 'idle' || track === null) return null;

  const isPlaying = phase === 'playing';
  const ratio = durationMs > 0 ? Math.min(1, positionMs / durationMs) : 0;
  const artworkUri = track.artworkPath ? `file://${track.artworkPath}` : null;

  return (
    <View className="border-t border-subtle bg-surface-elevated">
      {/*
        A hairline of progress rather than a scrub bar. The mini player says
        where you are; seeking is the full player's job, and a 2px target is
        not a control anyone can hit.
      */}
      <View className="h-1 w-full bg-surface">
        <View className="h-1 bg-accent" style={{ width: `${ratio * 100}%` }} />
      </View>

      <View className="flex-row items-center gap-3 px-4 py-2">
        <Pressable
          onPress={openPlayer}
          accessibilityRole="button"
          accessibilityLabel={t('player.open')}
          className="min-h-11 flex-1 flex-row items-center gap-3"
        >
          {artworkUri ? (
            <Image
              source={{ uri: artworkUri }}
              recyclingKey={String(track.id)}
              cachePolicy="memory-disk"
              contentFit="cover"
              className="h-10 w-10 rounded-xs"
            />
          ) : (
            <View className="h-10 w-10 items-center justify-center rounded-xs bg-surface">
              <Music color={colors.legend} size={18} strokeWidth={2} />
            </View>
          )}

          <View className="flex-1">
            <Text numberOfLines={1} className="font-body-medium text-sm text-primary">
              {track.title}
            </Text>
            {track.artistName ? (
              <Text numberOfLines={1} className="font-body text-sm text-muted">
                {track.artistName}
              </Text>
            ) : null}
          </View>
        </Pressable>

        <Pressable
          onPress={toggle}
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
          onPress={next}
          accessibilityRole="button"
          accessibilityLabel={t('player.next')}
          className="min-h-11 min-w-11 items-center justify-center"
        >
          <SkipForward color={colors.label} size={22} strokeWidth={2} fill={colors.label} />
        </Pressable>
      </View>
    </View>
  );
}
