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
}

/**
 * The new order of positions after moving `from` to `to`.
 *
 * Returns null when either index is outside the list, so a stale drag against a
 * playlist that changed underneath is a no-op rather than a write that shuffles
 * rows the user never touched.
 */
export function reorder(positions: readonly number[], from: number, to: number): number[] | null {
  if (from < 0 || to < 0 || from >= positions.length || to >= positions.length) return null;

  const next = [...positions];
  const [moved] = next.splice(from, 1);
  if (moved === undefined) return null;
  next.splice(to, 0, moved);
  return next;
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
      };
      byId.set(row.id, summary);
    }

    // A left join on an empty playlist yields one row with no position. That is
    // the absence of a track, not a track.
    if (row.position === null) continue;
    summary.trackCount += 1;

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
