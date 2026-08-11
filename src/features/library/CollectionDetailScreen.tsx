import { useRouter } from 'expo-router';
import { ChevronLeft, Play, Shuffle } from 'lucide-react-native';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Skeleton } from '@/components/ui/Skeleton';
import { useAlbumCards, useArtistCards, useCollectionTracks } from '@/db/queries/tracks';
import { AudioEngine } from '@/services/audio/AudioEngine';
import type { QueueSource } from '@/services/audio/types';
import { getShuffleAlgorithm } from '@/services/settings';
import { useThemeColors } from '@/theme/useTheme';

import { toPlayable } from '../player/toPlayable';
import { CollectionHeader } from './components/CollectionHeader';
import { LibraryTracks } from './LibraryTracks';

export interface CollectionDetailScreenProps {
  kind: 'artist' | 'album';
  id: number;
}

/**
 * Everything by one artist, or everything on one album.
 *
 * Reuses `LibraryTracks` wholesale, so a track here has exactly the same verbs
 * as a track in the library — swipe to queue, long-press for the sheet,
 * multi-select. A second, thinner track list for this screen would have drifted
 * from the first within a release.
 *
 * Playing from here attributes the listen to the artist or album rather than to
 * the library, which is what puts rows under those entity types in
 * `stats_rollups` — see `QueueSource`.
 */
export function CollectionDetailScreen({ kind, id }: CollectionDetailScreenProps) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const router = useRouter();

  const tracks = useCollectionTracks(kind, id);

  /*
   * The card comes from the same query the grid used, so the header shows
   * exactly what the user tapped. Cheap: both lists are already live and in
   * memory for the library screen behind this one.
   */
  const artists = useArtistCards();
  const albums = useAlbumCards();
  const card = (kind === 'artist' ? artists : albums).find((entry) => entry.id === id);

  const source = useMemo<QueueSource>(() => ({ type: kind, id }), [kind, id]);

  const play = useCallback(() => {
    if (tracks.length > 0) void AudioEngine.setQueue(tracks.map(toPlayable), 0, source);
  }, [tracks, source]);

  const shuffle = useCallback(async () => {
    if (tracks.length === 0) return;
    // Queue first, shuffle second: the engine keeps the unshuffled order, so
    // turning shuffle off later restores the album's real running order.
    await AudioEngine.setQueue(tracks.map(toPlayable), 0, source);
    await AudioEngine.setShuffled(true, getShuffleAlgorithm());
  }, [tracks, source]);

  const goBack = useCallback(() => router.back(), [router]);

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-surface">
      <View className="flex-row items-center gap-2 px-4 pt-6">
        <Pressable
          onPress={goBack}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          className="min-h-11 min-w-11 items-center justify-center"
        >
          <ChevronLeft color={colors.label} size={26} strokeWidth={2} />
        </Pressable>
      </View>

      {card ? (
        <CollectionHeader
          kind={kind}
          name={card.name}
          subtitle={card.subtitle}
          isUnknown={card.isUnknown}
          isUnknownSubtitle={card.isUnknownSubtitle}
          trackCount={tracks.length}
          artworkPath={card.artworkPath}
        />
      ) : (
        // The card list is live and lands a frame or two after the tracks do.
        <View className="flex-row items-end gap-4 px-6 pb-4">
          <Skeleton className="aspect-square w-1/3 rounded-xs" />
          <View className="flex-1 gap-2 pb-1">
            <Skeleton className="h-6 w-3/4 rounded-xs" />
            <Skeleton className="h-4 w-1/3 rounded-xs" />
          </View>
        </View>
      )}

      {tracks.length > 0 ? (
        <View className="flex-row gap-3 px-6 pb-4">
          <Pressable
            onPress={play}
            accessibilityRole="button"
            accessibilityLabel={t('playlists.playAll')}
            className="min-h-11 flex-1 flex-row items-center justify-center gap-2 rounded-sm bg-accent px-4"
          >
            <Play color={colors.onSignal} size={18} strokeWidth={2} fill={colors.onSignal} />
            <Text className="font-body-medium text-base text-on-accent">
              {t('playlists.playAll')}
            </Text>
          </Pressable>

          <Pressable
            onPress={() => void shuffle()}
            accessibilityRole="button"
            accessibilityLabel={t('playlists.shuffleAll')}
            className="min-h-11 flex-1 flex-row items-center justify-center gap-2 rounded-sm border border-subtle px-4"
          >
            <Shuffle color={colors.signal} size={18} strokeWidth={2} />
            <Text className="font-body-medium text-base text-accent">
              {t('playlists.shuffleAll')}
            </Text>
          </Pressable>
        </View>
      ) : null}

      <LibraryTracks
        tracks={tracks}
        isLoading={false}
        search=""
        /* Never empty in practice — the grid only offers rows that have tracks
           — and an empty state here would be about the wrong thing anyway. */
        suppressEmpty
        onAddFolder={noop}
      />
    </SafeAreaView>
  );
}

function noop(): void {
  // This screen cannot scan or refresh; the library above it does both.
}
