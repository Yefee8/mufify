import { Image } from 'expo-image';
import { Disc3, Heart, User } from 'lucide-react-native';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DetailChrome } from '@/components/ui/DetailChrome';
import { Skeleton } from '@/components/ui/Skeleton';
import { WindowSplit } from '@/components/ui/WindowSplit';
import {
  setAlbumFavorite,
  useCollectionCard,
  useCollectionTracks,
  useFavoriteAlbumIds,
} from '@/db/queries/tracks';
import { useMiniPlayerInset } from '@/features/player/playerLayerLayout';
import { AudioEngine } from '@/services/audio/AudioEngine';
import type { QueueSource } from '@/services/audio/types';
import { getShuffleAlgorithm } from '@/services/settings';
import { useThemeColors } from '@/theme/useTheme';

import { toPlayable } from '../player/toPlayable';
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
 * multi-select — and `DetailChrome` for everything above the list, so this
 * screen, a playlist and the library read as one app. What is this screen's
 * own: the album heart, and attributing a listen to the artist or album rather
 * than to the library, which is what puts rows under those entity types in
 * `stats_rollups` — see `QueueSource`.
 */
export function CollectionDetailScreen({ kind, id }: CollectionDetailScreenProps) {
  const { t } = useTranslation();
  const colors = useThemeColors();

  const tracks = useCollectionTracks(kind, id);

  /*
   * The card is built from the same columns the grid uses, so the header shows
   * exactly what the user tapped — but for this collection alone; the grid's
   * own queries group the whole library. See `useCollectionCard`.
   */
  const { card } = useCollectionCard(kind, id);

  /*
   * Liking, on the screen rather than only behind a long press on the grid.
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

  const bottomInset = useMiniPlayerInset();

  const unknownName = t(kind === 'artist' ? 'common.unknownArtist' : 'common.unknownAlbum');
  const Icon = kind === 'artist' ? User : Disc3;

  return (
    <SafeAreaView edges={['top', 'left', 'right']} className="flex-1 bg-surface">
      <WindowSplit
        bottomInset={bottomInset}
        aside={
          <DetailChrome
            actions={
              canFavorite ? (
                <Pressable
                  onPress={toggleFavorite}
                  accessibilityRole="switch"
                  accessibilityState={{ checked: isFavorite }}
                  accessibilityLabel={
                    isFavorite ? t('library.unlikeAlbum') : t('library.likeAlbum')
                  }
                  className="min-h-11 min-w-11 items-center justify-center"
                >
                  <Heart
                    color={isFavorite ? colors.signal : colors.legend}
                    fill={isFavorite ? colors.signal : 'transparent'}
                    size={22}
                    strokeWidth={2}
                  />
                </Pressable>
              ) : null
            }
            artwork={
              card === null ? (
                // The card is live and lands a frame after the screen draws.
                <Skeleton className="h-full w-full rounded-xs" />
              ) : card.artworkPath ? (
                <Image
                  source={{ uri: `file://${card.artworkPath}` }}
                  recyclingKey={`${kind}-${card.name ?? 'unknown'}`}
                  cachePolicy="memory-disk"
                  contentFit="cover"
                  transition={0}
                  className="h-full w-full rounded-xs"
                />
              ) : (
                <View className="h-full w-full items-center justify-center rounded-xs bg-surface-elevated">
                  <Icon color={colors.legend} size={40} strokeWidth={1.5} />
                </View>
              )
            }
            name={card === null ? null : card.isUnknown ? unknownName : (card.name ?? unknownName)}
            subtitle={
              card === null || card.isUnknown
                ? null
                : card.isUnknownSubtitle
                  ? t('common.unknownArtist')
                  : card.subtitle
            }
            meta={t('library.trackCount', { count: tracks.length })}
            onPlay={play}
            onShuffle={() => void shuffle()}
            playDisabled={tracks.length === 0}
          />
        }
      >
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
      </WindowSplit>
    </SafeAreaView>
  );
}

function noop(): void {
  // This screen cannot scan or refresh; the library above it does both.
}
