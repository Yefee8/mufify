import type { Rng, ShuffleTrack } from './types';

/**
 * Shuffles the albums, never the album.
 *
 * A symphony shuffled track-by-track is noise, and a concept record loses the
 * only thing that made it one. This picks album order at random and leaves the
 * running order inside each one exactly as it was — which is what someone with
 * a classical or progressive library means when they say they want shuffle.
 *
 * The queue arrives already sorted by title, not by track number, so intra-
 * album order here is the order the caller supplied. That is the honest
 * contract: this algorithm preserves the order it is given rather than
 * inventing one.
 */
export function albumShuffle<T extends ShuffleTrack>(tracks: readonly T[], rng: Rng): T[] {
  const groups = new Map<string, T[]>();

  for (const track of tracks) {
    // A track with no album is its own group, so loose files stay loose rather
    // than being welded into one imaginary record.
    const key = track.albumName ?? ` single:${track.id}`;
    const group = groups.get(key);
    if (group) group.push(track);
    else groups.set(key, [track]);
  }

  return shuffleGroups([...groups.values()], rng).flat();
}

/**
 * Fisher-Yates over the albums themselves.
 *
 * `pureShuffle` shuffles tracks; this shuffles arrays of them, and the two
 * cannot share a signature without loosening the track constraint that keeps
 * every other algorithm honest.
 */
function shuffleGroups<T>(groups: T[][], rng: Rng): T[][] {
  const result = [...groups];

  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(rng() * (index + 1));
    const a = result[index];
    const b = result[swap];
    if (a === undefined || b === undefined) continue;
    result[index] = b;
    result[swap] = a;
  }

  return result;
}
