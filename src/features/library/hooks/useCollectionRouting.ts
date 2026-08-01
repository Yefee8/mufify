import { useRouter } from 'expo-router';
import { useCallback, useMemo } from 'react';

export interface CollectionRouting {
  openArtist: (id: number) => void;
  openAlbum: (id: number) => void;
}

/**
 * Navigation into an artist or album.
 *
 * A hook rather than two inline arrows, so `CollectionGrid` receives callbacks
 * that are stable across renders — the cards are memoized on prop identity and
 * a fresh closure per render would defeat that for every visible cover.
 */
export function useCollectionRouting(): CollectionRouting {
  const router = useRouter();

  const openArtist = useCallback(
    (id: number) => router.navigate(`/collection/artist/${id}`),
    [router],
  );

  const openAlbum = useCallback(
    (id: number) => router.navigate(`/collection/album/${id}`),
    [router],
  );

  return useMemo(() => ({ openArtist, openAlbum }), [openArtist, openAlbum]);
}
