import { LIKED_SONGS_ID, type PlaylistSummary } from '@/services/playlists/order';

import { buildPlaylistRows, shouldShowEmptyState, type FavoriteRow } from './playlistRows';

const LIKED = 'Liked Songs';

function playlist(id: number, trackCount = 0): PlaylistSummary {
  return { id, name: `list-${id}`, trackCount, artworkPath: null, mosaic: [] };
}

function favorites(count: number, withArtwork = 0): FavoriteRow[] {
  return Array.from({ length: count }, (_, index) => ({
    artworkPath: index < withArtwork ? `/covers/${index}.jpg` : null,
  }));
}

describe('buildPlaylistRows', () => {
  it('counts the liked songs it was given, not zero', () => {
    const rows = buildPlaylistRows(favorites(7), [], LIKED);

    expect(rows[0]).toMatchObject({ id: LIKED_SONGS_ID, name: LIKED, trackCount: 7 });
  });

  it('leaves Liked Songs out while nothing is liked', () => {
    expect(buildPlaylistRows([], [playlist(1)], LIKED)).toEqual([playlist(1)]);
  });

  it('puts Liked Songs first, then the user playlists in the order given', () => {
    const rows = buildPlaylistRows(favorites(1), [playlist(3), playlist(2)], LIKED);

    expect(rows.map((row) => row.id)).toEqual([LIKED_SONGS_ID, 3, 2]);
  });

  it('takes at most four covers for the mosaic, skipping tracks without one', () => {
    const rows = buildPlaylistRows(favorites(9, 6), [], LIKED);

    expect(rows[0]?.mosaic).toHaveLength(4);
  });
});

describe('shouldShowEmptyState', () => {
  /*
   * The regression this pins: the tab rendered "there is nothing here, make a
   * playlist" *underneath* a visible row, because the empty state asked
   * `playlists.length` while the list rendered something else. Whatever the
   * rows are built from, the empty state answers a question about the rows.
   */
  it('is false whenever the list has a row — including a liked-songs-only list', () => {
    const rows = buildPlaylistRows(favorites(12), [], LIKED);

    expect(rows).not.toHaveLength(0);
    expect(rows[0]?.trackCount).toBeGreaterThan(0);
    expect(shouldShowEmptyState(rows)).toBe(false);
  });

  it('is false when the user has playlists but nothing liked', () => {
    expect(shouldShowEmptyState(buildPlaylistRows([], [playlist(1)], LIKED))).toBe(false);
  });

  it('is true only when there is genuinely nothing', () => {
    expect(shouldShowEmptyState(buildPlaylistRows([], [], LIKED))).toBe(true);
  });

  it('never disagrees with the count the header shows', () => {
    for (const likedCount of [0, 1, 5]) {
      for (const listCount of [0, 1, 4]) {
        const rows = buildPlaylistRows(
          favorites(likedCount),
          Array.from({ length: listCount }, (_, index) => playlist(index + 1)),
          LIKED,
        );

        // The header renders `rows.length`, so the two can only ever agree.
        expect(shouldShowEmptyState(rows)).toBe(rows.length === 0);
      }
    }
  });
});
