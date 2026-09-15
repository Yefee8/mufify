import { clusterBySimilarName } from '@/services/text/cluster';
import { isSimilar } from '@/services/text/similarity';

/**
 * Adding up the listening of one band filed under several spellings — and of
 * one record filed under several spellings of its name or its band's.
 *
 * A library tagged by a dozen different tools holds "Linkin Park", "LINKIN
 * PARK" and "linkin park" as three artists, and the statistics screens ranked
 * them as three — splitting a year of listening three ways and showing
 * somebody two strangers alongside a band they know. Nobody thinks of those as
 * separate, so the totals should not either. Albums have it twice over: the
 * scanner keys them by `(name, artist)`, so the same record under two
 * spellings of the band is two albums, and so is the record itself written
 * "Hybrid Theory" and "Hybrid theory".
 *
 * **Not a setting.** Every other grouping in this release is something the user
 * can turn off, and this one is not, because there is no reading of the data
 * under which three spellings of one band are three bands. A switch here would
 * only ever be turned on.
 *
 * Merged above the query rather than in it. Rollups are keyed by artist or
 * album id and SQL has no notion of "almost the same name"; more to the point,
 * the rows are already ranked and limited, so this operates on a few dozen of
 * them and can afford to compare every pair exactly.
 */

/** What this needs from a ranked row. Structural, to keep the db out of it. */
export interface RankedArtist {
  id: number;
  title: string | null;
  playCount: number;
  msPlayed: number;
  artworkPath: string | null;
}

/** An album row carries its artist as the subtitle. */
export interface RankedAlbum extends RankedArtist {
  subtitle: string | null;
}

/** Names this alike are one artist, or one album. */
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
  return mergeRanked(entries, limit, () => true);
}

/**
 * The same for albums, with one more condition: **the artist has to agree**.
 *
 * "Greatest Hits" is on every third band's shelf and those are not one record.
 * Checked separately from the name rather than by joining the two into one
 * string — a long album title with a short band name after it would score
 * alike for two different bands, which is the exact wrong merge.
 *
 * Two albums with *no* artist at all are compared on the name alone. The
 * scanner already keeps one row per untagged album name, so what reaches here
 * are spellings — "Live" and "Live!" — and those are one record in the same
 * sense the artists above are one band.
 */
export function mergeSimilarAlbums<T extends RankedAlbum>(entries: readonly T[], limit: number): T[] {
  return mergeRanked(entries, limit, sameArtist);
}

/** Whether two albums sharing a name are on the same band's shelf. */
function sameArtist(left: RankedAlbum, right: RankedAlbum): boolean {
  const a = left.subtitle ?? '';
  const b = right.subtitle ?? '';
  if (a.length === 0 && b.length === 0) return true;
  if (a.length === 0 || b.length === 0) return false;
  return isSimilar(a, b, ARTIST_MERGE_THRESHOLD);
}

/**
 * Cluster by name, split each cluster by `belongsWith`, sum, re-rank, trim.
 *
 * The split inside a name cluster is a first-match-wins scan rather than a
 * union, as in `dedupeTracks`: the clusters are tiny, and chaining "close to A"
 * and "close to B" across a pair that are not close to each other is how the
 * artist condition would get bypassed transitively.
 */
function mergeRanked<T extends RankedArtist>(
  entries: readonly T[],
  limit: number,
  belongsWith: (leader: T, entry: T) => boolean,
): T[] {
  const groups = clusterBySimilarName(entries, (entry) => entry.title ?? '', {
    threshold: ARTIST_MERGE_THRESHOLD,
    // A ranked list is a few dozen rows; compare every pair rather than a
    // window, so the grouping is exact where it can cheaply be.
    window: Number.POSITIVE_INFINITY,
  });

  const merged: T[] = [];

  for (const group of groups) {
    const buckets: T[][] = [];
    for (const entry of group) {
      const bucket = buckets.find((candidate) => belongsWith(candidate[0] as T, entry));
      if (bucket) bucket.push(entry);
      else buckets.push([entry]);
    }
    for (const bucket of buckets) merged.push(fold(bucket));
  }

  // Re-ranked, because a merge can lift a row past ones that were above it —
  // which is the entire point of doing this.
  merged.sort((left, right) =>
    right.playCount !== left.playCount
      ? right.playCount - left.playCount
      : right.msPlayed - left.msPlayed,
  );

  return merged.slice(0, limit);
}

/** One row for the bucket, wearing the most-played member's identity. */
function fold<T extends RankedArtist>(bucket: readonly T[]): T {
  const leader = bucket.reduce(mostPlayed);

  return {
    ...leader,
    playCount: bucket.reduce((total, entry) => total + entry.playCount, 0),
    msPlayed: bucket.reduce((total, entry) => total + entry.msPlayed, 0),
    // A cover from whichever member has one: the most-played spelling may be
    // on the only files that were never given artwork.
    artworkPath: leader.artworkPath ?? bucket.find((entry) => entry.artworkPath)?.artworkPath ?? null,
  };
}

/** Ties broken by listening time, then by the order the query returned. */
function mostPlayed<T extends RankedArtist>(best: T, entry: T): T {
  if (entry.playCount !== best.playCount) return entry.playCount > best.playCount ? entry : best;
  return entry.msPlayed > best.msPlayed ? entry : best;
}
