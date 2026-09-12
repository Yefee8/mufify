import { clusterBySimilarName } from '@/services/text/cluster';

/**
 * Adding up the listening of one band filed under several spellings.
 *
 * A library tagged by a dozen different tools holds "Linkin Park", "LINKIN
 * PARK" and "linkin park" as three artists, and the statistics screens ranked
 * them as three — splitting a year of listening three ways and showing
 * somebody two strangers alongside a band they know. Nobody thinks of those as
 * separate, so the totals should not either.
 *
 * **Not a setting.** Every other grouping in this release is something the user
 * can turn off, and this one is not, because there is no reading of the data
 * under which three spellings of one band are three bands. A switch here would
 * only ever be turned on.
 *
 * Merged above the query rather than in it. Rollups are keyed by artist id and
 * SQL has no notion of "almost the same name"; more to the point, the rows are
 * already ranked and limited, so this operates on a few dozen of them and can
 * afford to compare every pair exactly.
 */

/** What this needs from a ranked row. Structural, to keep the db out of it. */
export interface RankedArtist {
  id: number;
  title: string | null;
  playCount: number;
  msPlayed: number;
  artworkPath: string | null;
}

/** Names this alike are one artist. */
export const ARTIST_MERGE_THRESHOLD = 0.9;

/**
 * Fold the spellings together, re-rank, and take the top `limit`.
 *
 * The caller has to over-fetch for this to be right: merging three rows into
 * one leaves a gap at the bottom of a top-ten, and the row that should fill it
 * was never selected. `useTopArtists` asks for several times the limit and
 * trims here.
 *
 * The surviving row keeps the identity of its **most-played** member — its id,
 * its spelling, its artwork. That is the spelling on the files the user
 * actually listens to, which is the one they will recognise; taking the
 * alphabetically-first would show a name that happens to sort early and may
 * appear on two tracks out of two hundred. The id matters too: it is what a tap
 * navigates to, so it has to be the one with something behind it.
 */
export function mergeSimilarArtists<T extends RankedArtist>(
  entries: readonly T[],
  limit: number,
): T[] {
  const groups = clusterBySimilarName(entries, (entry) => entry.title ?? '', {
    threshold: ARTIST_MERGE_THRESHOLD,
    // A ranked list is a few dozen rows; compare every pair rather than a
    // window, so the grouping is exact where it can cheaply be.
    window: Number.POSITIVE_INFINITY,
  });

  const merged = groups.map((group) => {
    const leader = group.reduce(mostPlayed);

    return {
      ...leader,
      playCount: group.reduce((total, entry) => total + entry.playCount, 0),
      msPlayed: group.reduce((total, entry) => total + entry.msPlayed, 0),
      // A cover from whichever member has one: the most-played spelling may be
      // on the only files that were never given artwork.
      artworkPath: leader.artworkPath ?? group.find((entry) => entry.artworkPath)?.artworkPath ?? null,
    };
  });

  // Re-ranked, because a merge can lift a row past ones that were above it —
  // which is the entire point of doing this.
  merged.sort((left, right) =>
    right.playCount !== left.playCount
      ? right.playCount - left.playCount
      : right.msPlayed - left.msPlayed,
  );

  return merged.slice(0, limit);
}

/** Ties broken by listening time, then by the order the query returned. */
function mostPlayed<T extends RankedArtist>(best: T, entry: T): T {
  if (entry.playCount !== best.playCount) return entry.playCount > best.playCount ? entry : best;
  return entry.msPlayed > best.msPlayed ? entry : best;
}
