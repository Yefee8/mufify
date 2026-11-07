import { useCallback, useState } from 'react';

import type { AlbumSort, ArtistSort, TrackSort } from '@/services/library/sortOrder';
import {
  getAlbumSort,
  getArtistSort,
  getTrackSort,
  setAlbumSort,
  setArtistSort,
  setTrackSort,
} from '@/services/settings';

export interface LibrarySort {
  tracks: TrackSort;
  albums: AlbumSort;
  artists: ArtistSort;
  changeTracks: (order: TrackSort) => void;
  changeAlbums: (order: AlbumSort) => void;
  changeArtists: (order: ArtistSort) => void;
}

/**
 * How each of the library's three views is ordered, remembered across launches.
 *
 * Read once from MMKV on mount — synchronously, so the first frame is already
 * in the remembered order rather than in the default and then re-sorted — and
 * written through on every change. Only the library screen shows these, so
 * plain state is enough; nothing else needs to hear about a change.
 */
export function useLibrarySort(): LibrarySort {
  const [tracks, setTracks] = useState(getTrackSort);
  const [albums, setAlbums] = useState(getAlbumSort);
  const [artists, setArtists] = useState(getArtistSort);

  const changeTracks = useCallback((order: TrackSort) => {
    setTracks(order);
    setTrackSort(order);
  }, []);

  const changeAlbums = useCallback((order: AlbumSort) => {
    setAlbums(order);
    setAlbumSort(order);
  }, []);

  const changeArtists = useCallback((order: ArtistSort) => {
    setArtists(order);
    setArtistSort(order);
  }, []);

  return { tracks, albums, artists, changeTracks, changeAlbums, changeArtists };
}
