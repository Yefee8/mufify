import type { Rng, ShuffleTrack } from './types';

/**
 * Favours what you have not heard.
 *
 * A large library develops a rut: the same two hundred tracks surface and the
 * rest may as well not be there. This weights selection toward low play
 * counts, so neglected tracks come up sooner without the others being excluded.
 *
 * Weight is `1 / (playCount + 1)`, so an unplayed track is twice as likely as
 * one played once and eleven times as likely as one played ten times. The
 * curve flattens quickly, which is the point: the difference between 40 plays
 * and 50 plays should not matter, while the difference between 0 and 1 should.
 *
 * Every track keeps a non-zero weight. "Discovery" biases the order; it does
 * not quietly shorten the queue, and a user who shuffles their library still
 * gets all of it.
 */
export function discoveryShuffle<T extends ShuffleTrack>(tracks: readonly T[], rng: Rng): T[] {
  const pool = tracks.map((track) => ({ track, weight: 1 / (Math.max(0, track.playCount) + 1) }));
  const result: T[] = [];

  let total = pool.reduce((sum, entry) => sum + entry.weight, 0);

  // Weighted selection without replacement: draw a point in the total weight,
  // walk until it is consumed, remove the winner. O(n²) on a 10,000-track
  // library is ~50M comparisons of a number — done once per shuffle, not per
  // frame, and still far cheaper than the query that produced the list.
  while (pool.length > 0) {
    let target = rng() * total;
    let chosen = pool.length - 1;

    for (let index = 0; index < pool.length; index += 1) {
      const entry = pool[index];
      if (entry === undefined) continue;
      target -= entry.weight;
      if (target <= 0) {
        chosen = index;
        break;
      }
    }

    const [picked] = pool.splice(chosen, 1);
    if (picked === undefined) break;
    total -= picked.weight;
    result.push(picked.track);
  }

  return result;
}
