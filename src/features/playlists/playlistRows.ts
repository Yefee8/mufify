import { LIKED_SONGS_ID, MOSAIC_SIZE, type PlaylistSummary } from '@/services/playlists/order';

/**
 * What the Playlists tab actually lists.
 *
 * Pure, and separate from the screen, because three things on that screen have
 * to agree and were each reading something different: the header count said
 * "0 lists", the Liked Songs row said "0 tracks", and the empty state said
 * there was nothing here — above a list that was showing a row.
 *
 * The header count came from `playlists.length`, which excludes Liked Songs;
 * the empty state came from the same number; the list rendered `rows`. Three
 * views of one collection, computed three times.
 *
 * `AGENTS.md` states the rule this breaks: *a count and the list it describes
 * come from one query*. So one function builds the rows, and the count and the
 * empty state are both facts about what it returned.
 */

/** One favourited track, as `useFavoriteEntries` returns it. */
export interface FavoriteRow {
  artworkPath: string | null;
}

/**
 * The rows, Liked Songs first.
 *
 * Liked Songs is included **only when it holds something**. It is a virtual
 * playlist with no existence of its own, and an always-present row reading
 * "0 tracks" is what made the counts contradict each other: either the header
 * counted it and disagreed with `playlists.length`, or it did not and the
 * screen showed a row it claimed was not there. A destination with nothing in
 * it is not a destination yet, and the moment anything is liked it appears.
 */
export function buildPlaylistRows(
  favorites: readonly FavoriteRow[],
  playlists: readonly PlaylistSummary[],
  likedSongsName: string,
): PlaylistSummary[] {
  if (favorites.length === 0) return [...playlists];

  return [
    {
      id: LIKED_SONGS_ID,
      name: likedSongsName,
      trackCount: favorites.length,
      mosaic: favorites
        .flatMap((entry) => (entry.artworkPath ? [entry.artworkPath] : []))
        .slice(0, MOSAIC_SIZE),
      artworkPath: null,
    },
    ...playlists,
  ];
}

/**
 * Whether the screen has nothing to show.
 *
 * The one condition, taken from the rendered rows rather than from any of the
 * collections behind them. An empty state above visible content is a straight
 * contradiction, and it shipped.
 */
export function shouldShowEmptyState(rows: readonly PlaylistSummary[]): boolean {
  return rows.length === 0;
}
