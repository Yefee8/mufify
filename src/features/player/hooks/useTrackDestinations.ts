import { useCallback, useMemo } from 'react';

import { getTrackCollections } from '@/db/queries/tracks';
import { useCollectionRouting } from '@/features/library/hooks/useCollectionRouting';

export interface TrackDestinations {
  /** Close Now Playing and open the album the track is on. */
  goToAlbum: (trackId: number) => void;
  /** Close Now Playing and open the artist who made it. */
  goToArtist: (trackId: number) => void;
}

/**
 * From the track on screen to the album or artist it came from.
 *
 * The player closes on the way, because it is drawn above the router: a screen
 * pushed underneath an open player is a screen nobody can see. Both start on
 * the same frame, so the sheet sliding down uncovers the page as it arrives.
 *
 * The ids are looked up when pressed — see `getTrackCollections`. A track that
 * has left the library since it started playing goes nowhere and leaves the
 * player open, which is the honest answer to "show me this album".
 */
export function useTrackDestinations(close: () => void): TrackDestinations {
  const { openAlbum, openArtist } = useCollectionRouting();

  const goToAlbum = useCallback(
    (trackId: number) => {
      void getTrackCollections(trackId).then((where) => {
        if (where === null) return;
        close();
        openAlbum(where.albumId);
      });
    },
    [close, openAlbum],
  );

  const goToArtist = useCallback(
    (trackId: number) => {
      void getTrackCollections(trackId).then((where) => {
        if (where === null) return;
        close();
        openArtist(where.artistId);
      });
    },
    [close, openArtist],
  );

  return useMemo(() => ({ goToAlbum, goToArtist }), [goToAlbum, goToArtist]);
}
