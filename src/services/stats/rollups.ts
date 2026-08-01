/**
 * What a listen contributes to the rollup table.
 *
 * Pure, because rollup correctness is the one thing in the statistics that
 * cannot be checked by looking at the screen: a rollup that drifts from the
 * events it summarises produces numbers that are wrong but plausible. Keeping
 * the fan-out here means it can be compared against a brute-force recount over
 * `play_events`, which is what `AGENTS.md` asks for.
 */

import type { PeriodKeys } from './periodKeys';

export const PERIOD_TYPES = ['week', 'month', 'year'] as const;
export type PeriodType = (typeof PERIOD_TYPES)[number];

export const ENTITY_TYPES = ['track', 'artist', 'album', 'playlist'] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];

/**
 * Reserved rollup id for an artist or album absent from a file's metadata.
 *
 * SQLite auto-increment ids begin at 1, so 0 cannot collide with a real row.
 * Keeping the fallback out of the content tables also keeps its display name
 * localised at render time rather than persisting one language in user data.
 */
export const UNKNOWN_ENTITY_ID = 0;

/** One `(period, entity)` cell and the amounts to add to it. */
export interface RollupDelta {
  periodType: PeriodType;
  periodKey: string;
  entityType: EntityType;
  entityId: number;
  playCount: number;
  msPlayed: number;
}

/** The entities one listen belongs to. Null artist and album ids share id 0. */
export interface ListenSubject {
  trackId: number;
  artistId: number | null;
  albumId: number | null;
  /** Set only when the listen came from a playlist. */
  playlistId?: number | null;
}

export interface ListenContribution {
  subject: ListenSubject;
  keys: PeriodKeys;
  msPlayed: number;
  /**
   * Only a `play` increments the count. A skip and a partial still contribute
   * milliseconds, so listening time stays honest while the counters do not
   * reward abandoning a track. See `docs/adr/005-play-skip-partial.md`.
   */
  countsAsPlay: boolean;
}

/**
 * Fan one listen out into every cell it touches.
 *
 * Three periods times four entities, minus a missing playlist. Written as a
 * product rather than by hand so a new period or entity type cannot be added
 * to one and forgotten in the others.
 */
export function rollupDeltas({
  subject,
  keys,
  msPlayed,
  countsAsPlay,
}: ListenContribution): RollupDelta[] {
  const periods: { periodType: PeriodType; periodKey: string }[] = [
    { periodType: 'week', periodKey: keys.week },
    { periodType: 'month', periodKey: keys.month },
    { periodType: 'year', periodKey: keys.year },
  ];

  const entities: { entityType: EntityType; entityId: number }[] = [
    { entityType: 'track', entityId: subject.trackId },
    { entityType: 'artist', entityId: subject.artistId ?? UNKNOWN_ENTITY_ID },
    { entityType: 'album', entityId: subject.albumId ?? UNKNOWN_ENTITY_ID },
  ];
  if (subject.playlistId != null) {
    entities.push({ entityType: 'playlist', entityId: subject.playlistId });
  }

  const playCount = countsAsPlay ? 1 : 0;

  return periods.flatMap((period) =>
    entities.map((entity) => ({ ...period, ...entity, playCount, msPlayed })),
  );
}

/** A cell key, for folding deltas together. */
export function rollupKey(delta: {
  periodType: string;
  periodKey: string;
  entityType: string;
  entityId: number;
}): string {
  return `${delta.periodType}|${delta.periodKey}|${delta.entityType}|${delta.entityId}`;
}

/**
 * Sum many deltas into one entry per cell.
 *
 * Used by the brute-force recount in tests, and by anything that replays a
 * batch of events — a single listen produces up to twelve rows, and writing
 * them one at a time would be twelve upserts where one will do.
 */
export function foldDeltas(deltas: readonly RollupDelta[]): RollupDelta[] {
  const totals = new Map<string, RollupDelta>();

  for (const delta of deltas) {
    const key = rollupKey(delta);
    const existing = totals.get(key);
    if (existing) {
      existing.playCount += delta.playCount;
      existing.msPlayed += delta.msPlayed;
    } else {
      totals.set(key, { ...delta });
    }
  }

  return [...totals.values()];
}
