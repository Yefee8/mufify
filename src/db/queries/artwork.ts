import { and, eq, isNotNull, notLike } from 'drizzle-orm';

import { db } from '../client';
import { tracks } from '../schema';

/**
 * Every distinct cover path that does not live under `home`.
 *
 * Roughly one per album — covers are content-addressed, so an album's tracks
 * share one file — and none at all once the relocation has run, which is what
 * makes it cheap to ask on every launch.
 */
export async function listStrayArtworkPaths(home: string): Promise<string[]> {
  const prefix = home.endsWith('/') ? home : `${home}/`;
  const rows = await db
    .selectDistinct({ path: tracks.artworkPath })
    .from(tracks)
    .where(and(isNotNull(tracks.artworkPath), notLike(tracks.artworkPath, `${prefix}%`)));
  return rows.flatMap((row) => (row.path === null ? [] : [row.path]));
}

/**
 * Point rows at their covers' new paths, and send rows whose cover is gone
 * back through the scan.
 *
 * A lost cover clears `lastScannedAt` along with the path: that is what puts
 * the row back in stage two's queue, so the next scan opens the file again and
 * writes a fresh cover — instead of skipping it forever as unchanged.
 *
 * One transaction, so a launch interrupted halfway leaves either the old paths
 * or the new ones, never a mixture with files already moved out from under it.
 */
export async function relinkArtwork(
  moves: ReadonlyMap<string, string>,
  lost: readonly string[],
): Promise<void> {
  if (moves.size === 0 && lost.length === 0) return;
  await db.transaction(async (tx) => {
    for (const [from, to] of moves) {
      await tx.update(tracks).set({ artworkPath: to }).where(eq(tracks.artworkPath, from));
    }
    for (const path of lost) {
      await tx
        .update(tracks)
        .set({ artworkPath: null, lastScannedAt: null })
        .where(eq(tracks.artworkPath, path));
    }
  });
}
