import { albumShuffle } from './album';
import { balancedShuffle } from './balanced';
import { discoveryShuffle } from './discovery';
import { favoritesShuffle } from './favorites';
import { pureShuffle } from './pure';
import { SHUFFLE_ALGORITHMS, type Rng, type ShuffleAlgorithm, type ShuffleTrack } from './types';

export { SHUFFLE_ALGORITHMS, DEFAULT_SHUFFLE } from './types';
export type { Rng, ShuffleAlgorithm, ShuffleTrack } from './types';

/**
 * The registry. One entry per algorithm, keyed by the id stored in settings
 * and written to `play_events.shuffle_algorithm`.
 *
 * A `Record` over the union rather than a lookup with a fallback, so adding an
 * id to `SHUFFLE_ALGORITHMS` without implementing it fails to compile.
 */
const REGISTRY: Record<
  ShuffleAlgorithm,
  <T extends ShuffleTrack>(tracks: readonly T[], rng: Rng) => T[]
> = {
  pure: pureShuffle,
  balanced: balancedShuffle,
  discovery: discoveryShuffle,
  favorites: favoritesShuffle,
  album: albumShuffle,
};

/** `Math.random`, named so the default is visible at the call site. */
export const systemRng: Rng = Math.random;

/** Reorder a queue with the chosen algorithm. Never mutates the input. */
export function shuffleTracks<T extends ShuffleTrack>(
  tracks: readonly T[],
  algorithm: ShuffleAlgorithm,
  rng: Rng = systemRng,
): T[] {
  return REGISTRY[algorithm](tracks, rng);
}

/** Whether a stored string is still a real algorithm. */
export function isShuffleAlgorithm(value: string): value is ShuffleAlgorithm {
  return (SHUFFLE_ALGORITHMS as readonly string[]).includes(value);
}
