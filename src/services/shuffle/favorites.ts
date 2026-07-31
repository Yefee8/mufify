import type { Rng, ShuffleTrack } from './types';

/**
 * The opposite of `discovery`: what you already love, first.
 *
 * Weight is the play count, with favourites boosted. Discovery divides by
 * plays; this multiplies by them, so the two are mirror images and a listener
 * can pick a mood rather than a setting.
 *
 * Every track keeps a floor of 1 so an unplayed one is unlikely rather than
 * impossible. A shuffle that can never reach half the library is a filter
 * wearing a shuffle's name.
 */
const FAVORITE_BOOST = 5;

export function favoritesShuffle<T extends ShuffleTrack>(tracks: readonly T[], rng: Rng): T[] {
  const pool = tracks.map((track) => ({
    track,
    weight: (1 + Math.max(0, track.playCount)) * (track.isFavorite ? FAVORITE_BOOST : 1),
  }));

  const result: T[] = [];
  let total = pool.reduce((sum, entry) => sum + entry.weight, 0);

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
