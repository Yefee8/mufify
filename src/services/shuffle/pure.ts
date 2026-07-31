import type { Rng, ShuffleTrack } from './types';

/**
 * Uniform shuffle. Every ordering equally likely.
 *
 * The honest baseline, and the one people are usually surprised by: true
 * randomness clusters, so a pure shuffle of an album-heavy library will play
 * three tracks by the same artist in a row and feel broken. That is what
 * `balanced` exists for. This stays because some people want the real thing,
 * and because every other algorithm is measured against it.
 */
export function pureShuffle<T extends ShuffleTrack>(tracks: readonly T[], rng: Rng): T[] {
  const result = [...tracks];

  // Fisher-Yates, descending. The classic off-by-one here is picking from the
  // whole array each time, which is not uniform — it favours some orderings.
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
