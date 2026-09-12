import { clusterBySimilarName } from '@/services/text/cluster';
import { isSimilar } from '@/services/text/similarity';

/**
 * Hiding the second copy of a song that is in the library twice.
 *
 * A folder imported after a device sweep, an album kept in two places, a file
 * copied before a re-encode — a real library ends up listing the same song
 * more than once, under spellings that differ only in case or punctuation.
 *
 * **A setting, unlike the artist merge.** This one hides something the user
 * owns, and there are reasons to disagree with it: two files may be a CD rip
 * and a vinyl rip that somebody wants to see side by side. The artist merge has
 * no such reading — three spellings of one band are never three bands — so that
 * one is not optional and this one is.
 *
 * Three conditions, all required, and each is there to stop a specific wrong
 * merge:
 *
 * - **The titles are alike.** The obvious one.
 * - **The artists are alike**, compared *separately*. Joining the two into one
 *   string and comparing that is the tempting shortcut and it is wrong: "Red
 *   Hot Chili Peppers — Song Pt. 1" against "…Pt. 2" is one character in
 *   thirty-one, which scores 0.97 and merges two different songs. Compared on
 *   its own the title is one character in ten, which does not.
 * - **The durations are close.** A studio recording and a live version share a
 *   title and an artist and are not the same track. Length is what separates
 *   them, and hiding one behind the other is exactly the complaint this feature
 *   would otherwise create.
 */

/** What this needs from a row. Structural, to keep the db out of it. */
export interface DedupableTrack {
  id: number;
  title: string;
  artistName: string | null;
  durationMs: number;
  playCount: number;
}

/** Names this alike are the same song, or the same artist. */
export const DEDUPE_THRESHOLD = 0.9;

/**
 * How far two durations may differ and still be one recording.
 *
 * Two seconds covers a re-encode's padding; past a few minutes the proportion
 * matters more than the absolute, so the larger of the two applies. It is
 * deliberately tight — a live take runs longer than this, and that is the
 * distinction being protected.
 */
function sameLength(left: number, right: number): boolean {
  const longest = Math.max(left, right);
  return Math.abs(left - right) <= Math.max(2_000, longest * 0.02);
}

/**
 * One row per song, in the order the list was already in.
 *
 * Titles are clustered first — that is the cheap pass, and it is where the
 * sliding window earns its keep on a ten-thousand-row library. Each resulting
 * cluster is then a handful of rows at most, so artist and duration are checked
 * pairwise inside it, exactly.
 *
 * The row that survives is the **most played**: if two copies of a song are in
 * the library, the one with the listening behind it is the one whose file the
 * user is actually pointing at, and keeping it means their play counts and
 * statistics go on referring to the row they can still see.
 */
export function dedupeTracks<T extends DedupableTrack>(tracks: readonly T[]): T[] {
  if (tracks.length < 2) return [...tracks];

  const byTitle = clusterBySimilarName(tracks, (track) => track.title, {
    threshold: DEDUPE_THRESHOLD,
  });

  const kept: T[] = [];

  for (const titleGroup of byTitle) {
    if (titleGroup.length === 1) {
      kept.push(titleGroup[0] as T);
      continue;
    }

    /*
     * Within one title, split on artist and length. A first-match-wins scan
     * rather than a union: these groups are tiny, and chaining "close to A" and
     * "close to B" across a pair that are not close to each other is how a
     * duration guard gets bypassed transitively.
     */
    const buckets: T[][] = [];

    for (const track of titleGroup) {
      const bucket = buckets.find((candidate) => belongsWith(candidate[0] as T, track));
      if (bucket) bucket.push(track);
      else buckets.push([track]);
    }

    for (const bucket of buckets) kept.push(bucket.reduce(mostPlayed));
  }

  return kept;
}

/** Whether two rows sharing a title are the same recording. */
function belongsWith(leader: DedupableTrack, track: DedupableTrack): boolean {
  if (!sameLength(leader.durationMs, track.durationMs)) return false;

  const left = leader.artistName ?? '';
  const right = track.artistName ?? '';
  // Two untagged tracks with the same title are not evidence of anything, so
  // an absent artist never matches — not even another absent one.
  if (left.length === 0 || right.length === 0) return false;

  return isSimilar(left, right, DEDUPE_THRESHOLD);
}

/** Ties broken by the longer file, then by id, so the choice is stable. */
function mostPlayed<T extends DedupableTrack>(best: T, track: T): T {
  if (track.playCount !== best.playCount) return track.playCount > best.playCount ? track : best;
  if (track.durationMs !== best.durationMs) return track.durationMs > best.durationMs ? track : best;
  return track.id < best.id ? track : best;
}
