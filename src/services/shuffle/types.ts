/**
 * The shuffle vocabulary.
 *
 * Several algorithms, chosen in Settings — the brief is explicit that this is
 * not one shuffle behind a toggle. Each is a pure function of (tracks, rng),
 * which is what lets them be tested for their *properties* rather than against
 * a recorded output.
 */

/** Uniform in [0, 1). Injected so tests are deterministic. */
export type Rng = () => number;

/** What a shuffle needs to know about a track. Deliberately not the whole row. */
export interface ShuffleTrack {
  id: number;
  /** Null is its own bucket: unknown artists are not all the same artist. */
  artistName: string | null;
  /** Lifetime plays, for algorithms that favour the neglected. */
  playCount: number;
}

export const SHUFFLE_ALGORITHMS = ['pure', 'balanced', 'discovery'] as const;
export type ShuffleAlgorithm = (typeof SHUFFLE_ALGORITHMS)[number];

export const DEFAULT_SHUFFLE: ShuffleAlgorithm = 'balanced';
