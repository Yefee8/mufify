import { useRouter } from 'expo-router';
import { ChevronLeft, Heart } from 'lucide-react-native';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Skeleton } from '@/components/ui/Skeleton';
import {
  setAlbumFavorite,
  useAlbumCards,
  useArtistCards,
  useCollectionTracks,
  useFavoriteAlbumIds,
} from '@/db/queries/tracks';
import { AudioEngine } from '@/services/audio/AudioEngine';
import type { QueueSource } from '@/services/audio/types';
import { getShuffleAlgorithm } from '@/services/settings';
import { useThemeColors } from '@/theme/useTheme';

import { PlayShuffleBar } from '@/components/ui/PlayShuffleBar';

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

  /*
   * Liking, on the screen rather than only behind a long press on the grid.
   * The grid's sheet is where you go to act on a record you are *not* looking
   * at; once it is open, having to back out and press-and-hold the card again
   * is the app asking the user to remember where the feature lives.
   *
   * Id 0 is the reserved "no album" card, which is the absence of an album
   * rather than one — there is no row to write a flag to.
   */
  const favorites = useFavoriteAlbumIds();
  const canFavorite = kind === 'album' && id !== 0;
  const isFavorite = canFavorite && favorites.some((entry) => entry.id === id);

  const toggleFavorite = useCallback(() => {
    void setAlbumFavorite(id, !isFavorite);
  }, [id, isFavorite]);

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
      {/* Back on the left, actions on the right — the arrangement the playlist
          screen already uses, so an album and a playlist read as two of the
          same kind of thing rather than two different screens. */}
      <View className="flex-row items-center gap-1 px-4 pt-6">
        <Pressable
          onPress={goBack}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          className="min-h-11 min-w-11 items-center justify-center"
        >
          <ChevronLeft color={colors.label} size={26} strokeWidth={2} />
        </Pressable>

        <View className="flex-1" />

        {canFavorite ? (
          <Pressable
            onPress={toggleFavorite}
            accessibilityRole="switch"
            accessibilityState={{ checked: isFavorite }}
            accessibilityLabel={isFavorite ? t('library.unlikeAlbum') : t('library.likeAlbum')}
            className="min-h-11 min-w-11 items-center justify-center"
          >
            <Heart
              color={isFavorite ? colors.signal : colors.legend}
              fill={isFavorite ? colors.signal : 'transparent'}
              size={22}
              strokeWidth={2}
            />
          </Pressable>
        ) : null}
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

      {/* The same pair the library and a playlist use, so starting an album
          is the gesture people already learned two screens ago. */}
      <PlayShuffleBar onPlay={play} onShuffle={() => void shuffle()} disabled={tracks.length === 0} />

      <LibraryTracks
        tracks={tracks}
        isLoading={false}
        search=""
        /* No filter on this screen: an album is already the filter. */
        likedOnly={false}
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
