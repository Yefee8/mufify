import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Music, Pause, Play, SkipForward } from 'lucide-react-native';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

import { useLifecycleTrace } from '@/services/perf/useLifecycleTrace';
import { useThemeColors } from '@/theme/useTheme';

import { useCurrentTrack, usePlaybackControls, usePlaybackPhase } from '../hooks/usePlayback';
import { MiniProgress } from './MiniProgress';
import { TransportSwipe } from './TransportSwipe';

/**
 * The persistent transport strip above the tab bar.
 *
 * Renders nothing at all when idle rather than sitting there empty — a dead
 * strip on a fresh install is clutter, and the tab bar should meet the list
 * until there is something playing.
 */
export function MiniPlayer() {
  useLifecycleTrace('MiniPlayer');
  const { t } = useTranslation();
  const colors = useThemeColors();
  const router = useRouter();
  /*
   * Phase and track, never position.
   *
   * Measured on the Pixel_7 AVD over ten seconds of playback: subscribing to
   * the whole engine state re-rendered this component 20 times — exactly the
   * engine's 2 Hz status interval — and 0 times after the split. `BottomTabBar`
   * next door was never affected either way, which is worth writing down
   * because it was the thing this change was first blamed on: React re-renders
   * the component whose store changed and its children, not its siblings.
   *
   * Twenty reconciliations of an `expo-image` and three Pressables per ten
   * seconds, forever, for a strip whose text has not changed. Position belongs
   * to `MiniProgress`, which is one animated view and re-renders never.
   */
  const phase = usePlaybackPhase();
  const track = useCurrentTrack();
  const { toggle, next, previous } = usePlaybackControls();

  const openPlayer = useCallback(() => router.push('/player'), [router]);

  if (phase === 'idle' || track === null) return null;

  const isPlaying = phase === 'playing';
  const artworkUri = track.artworkPath ? `file://${track.artworkPath}` : null;

  return (
    <View className="border-t border-subtle bg-surface-elevated">
      {/*
        A hairline of progress rather than a scrub bar. The mini player says
        where you are; seeking is the full player's job, and a 2px target is
        not a control anyone can hit.

        Outside the swipe wrapper: the bar reports position and should not slide
        around with the strip that reports the track.
      */}
      <MiniProgress />

      {/*
        Swipe up to open, sideways to change track. The strip is small and its
        two icon buttons are the only precise targets on it, so the gesture is
        how most people will actually drive it.
      */}
      <TransportSwipe onSwipeUp={openPlayer} onSwipeLeft={next} onSwipeRight={previous}>
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
      </TransportSwipe>
    </View>
  );
}
