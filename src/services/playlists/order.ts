/**
 * Playlist ordering and folding, kept away from the database.
 *
 * Both functions here are pure arithmetic over rows, and both are the kind that
 * is wrong at least once before it is right — a reorder that drops an entry, a
 * count that includes a track that isn't there. Neither needs a device to test.
 *
 * They live in `services` rather than beside the queries for a mechanical
 * reason as well as a tidiness one: `src/db/queries/playlists.ts` imports the
 * client, which opens SQLite at module load, so anything importing it cannot be
 * unit tested at all. `db/queries/playEvents.ts` already reaches into
 * `services/stats` for the same reason.
 */

/** How many covers the mosaic grid can show. */
import { searchHaystack } from '@/services/text/search';

export const MOSAIC_SIZE = 4;

/**
 * Virtual route id for liked songs; it never exists in `playlists`.
 *
 * Here rather than beside the queries for the reason above: importing
 * `src/db/queries/playlists.ts` opens SQLite, so a constant kept there drags a
 * database into every test that needs to name this playlist. Re-exported from
 * the query module, so screens still import it from where they always did.
 */
export const LIKED_SONGS_ID = -1;

export interface PlaylistSummary {
  id: number;
  name: string;
  trackCount: number;
  /** Liked playlists are pinned above the rest by the query that reads them. */
  isFavorite: boolean;
  /**
   * The single thumbnail: the cover the user chose, or failing that the first
   * track's. Null when there is neither.
   */
  artworkPath: string | null;
  /**
   * Only the cover the user chose. Kept apart from `artworkPath` because the
   * mosaic is suppressed for a chosen cover and not for a borrowed one — the
   * four-square grid *is* the default, and falling back to it would undo the
   * choice the moment a playlist gained a second album.
   */
  coverPath: string | null;
  /**
   * Up to four covers, in playlist order, for the mosaic thumbnail.
   *
   * The component decides what to draw with fewer than four — this only says
   * what is available.
   */
  mosaic: string[];
  /**
   * The playlist's name and everything in it, normalised for the search box.
   *
   * Prebuilt because the Playlists tab filters on every keystroke and the
   * contents of every playlist is a lot of text to fold per character. See
   * `searchHaystack`.
   */
  search: string;
}

/** One row of the flat playlist join: a playlist, and one of its entries. */
export interface PlaylistRow {
  id: number;
  name: string;
  /** Null when the playlist has no tracks at all. */
  position: number | null;
  artworkPath: string | null;
  isFavorite: boolean;
  /** The playlist's own cover, if the user chose one. */
  coverPath: string | null;
  /** The entry's track, for searching a playlist by what is in it. */
  trackTitle: string | null;
  artistName: string | null;
  albumName: string | null;
}

/**
 * The list with the item at `from` lifted out and dropped at `to`.
 *
 * Returns null when either index is outside the list, so a stale drag against a
 * playlist that changed underneath is a no-op rather than a write that shuffles
 * rows the user never touched.
 *
 * Generic because the same move happens twice for one drag: over positions, on
 * the way to the database, and over the rows themselves, to show the new order
 * before the write lands — see `useReorderableEntries`. Two copies of
 * `splice`-out-`splice`-in is two places for the off-by-one to live.
 */
export function moveItem<T>(items: readonly T[], from: number, to: number): T[] | null {
  if (from < 0 || to < 0 || from >= items.length || to >= items.length) return null;

  const next = [...items];
  const [moved] = next.splice(from, 1);
  if (moved === undefined) return null;
  next.splice(to, 0, moved);
  return next;
}

/**
 * The ids with `moved` taken out and put back straight after `after` — or at
 * the front when `after` is null.
 *
 * How a drop is written to the database, in preference to two positions. A
 * position is only true of the database as it stood when the screen last
 * heard from it, and two drags in quick succession can each be computed
 * against a table the other has already rewritten; "after this row" is true
 * whatever happened in between. It also needs no translation between the
 * visible list and the table, which disagree whenever a file is missing.
 *
 * Null when either id is not in the list, so a drop against a playlist that
 * changed underneath writes nothing rather than something wrong.
 */
export function placeAfter<T>(ids: readonly T[], moved: T, after: T | null): T[] | null {
  const from = ids.indexOf(moved);
  if (from === -1 || after === moved) return null;

  const rest = [...ids.slice(0, from), ...ids.slice(from + 1)];
  if (after === null) return [moved, ...rest];

  const at = rest.indexOf(after);
  if (at === -1) return null;
  return [...rest.slice(0, at + 1), moved, ...rest.slice(at + 1)];
}

/**
 * Collapse the flat join into one summary per playlist.
 *
 * Insertion order is preserved, which matters: the query orders by `updatedAt
 * DESC`, and folding through a Map must not quietly reshuffle that into id
 * order.
 */
export function foldPlaylistRows(rows: readonly PlaylistRow[]): PlaylistSummary[] {
  const byId = new Map<number, PlaylistSummary>();

  for (const row of rows) {
    let summary = byId.get(row.id);
    if (!summary) {
      summary = {
        id: row.id,
        name: row.name,
        trackCount: 0,
        isFavorite: row.isFavorite,
        artworkPath: row.coverPath,
        coverPath: row.coverPath,
        mosaic: [],
        search: searchHaystack([row.name]),
      };
      byId.set(row.id, summary);
    }

    // A left join on an empty playlist yields one row with no position. That is
    // the absence of a track, not a track.
    if (row.position === null) continue;
    summary.trackCount += 1;

    /*
     * The playlist's own searchable text grows with its contents.
     *
     * Built here, once per query result, rather than in the filter: the tab
     * filters on every keystroke, and normalising every title, artist and
     * album in every playlist per character typed is the whole tab's text
     * through the normaliser for each letter. Duplicates are not worth
     * removing — `includes` does not care, and the check would cost more than
     * the bytes.
     */
    summary.search += ` ${searchHaystack([row.trackTitle, row.artistName, row.albumName])}`;

    if (row.artworkPath === null) continue;
    summary.artworkPath ??= row.artworkPath;

    // Deduplicated: an album's worth of tracks all share one cover, and a
    // mosaic of the same square four times reads as a rendering bug.
    if (summary.mosaic.length < MOSAIC_SIZE && !summary.mosaic.includes(row.artworkPath)) {
      summary.mosaic.push(row.artworkPath);
    }
  }

  return [...byId.values()];
}
