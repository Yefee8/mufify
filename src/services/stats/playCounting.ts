/**
 * The rule that decides whether listening to something counted.
 *
 * Pure, so it is unit tested and so the stats screens can never disagree with
 * the recorder about what a play is.
 */

/**
 * Three outcomes, not two.
 *
 * - `play`  — it counted. Increments `play_count`.
 * - `skip`  — abandoned early. Increments `skip_count`.
 * - `partial` — it happened and counts as neither. Still contributes
 *   `ms_played`, so listening time stays honest even when the listen was not
 *   decisive either way.
 */
export type ListenOutcome = 'play' | 'skip' | 'partial';

export const LISTEN_OUTCOMES = ['play', 'skip', 'partial'] as const;

/** The duration where the two thresholds meet: 2.5 minutes. */
export const THRESHOLD_CROSSOVER_MS = 150_000;

/** A play needs 30 seconds, or half the track if the track is shorter. */
export function playThresholdMs(durationMs: number): number {
  return Math.min(30_000, durationMs * 0.5);
}

/** A skip is abandoning it inside the first fifth. */
export function skipThresholdMs(durationMs: number): number {
  return durationMs * 0.2;
}

/**
 * Classify one listen.
 *
 * The two thresholds cross at 2.5 minutes, and they behave differently either
 * side of it. Both regions resolve to a defined outcome — nothing falls
 * through:
 *
 * **Longer than 2.5 minutes — the thresholds overlap.** `duration * 0.2` is
 * past the 30-second play mark, so a 4-minute track heard for 40 seconds is
 * over the play threshold *and* under the skip threshold. Evaluation is
 * ordered and **play is checked first**, so the overlap counts as a play.
 *
 * **Shorter than 2.5 minutes — the thresholds leave a gap.** The skip mark is
 * below the play mark, so a 20-second track heard for 5 seconds is under the
 * play threshold and over the skip threshold. That is `partial`: it is
 * recorded, its milliseconds count towards listening time, and it moves
 * neither counter.
 *
 * Settled in `docs/adr/005-play-skip-partial.md`. Not reopening this in
 * Phase 7 — by then every rollup depends on it.
 */
export function classifyListen(msPlayed: number, durationMs: number): ListenOutcome {
  if (durationMs <= 0 || msPlayed <= 0) return 'partial';

  if (msPlayed >= playThresholdMs(durationMs)) return 'play';
  if (msPlayed < skipThresholdMs(durationMs)) return 'skip';

  return 'partial';
}

/**
 * True when the play threshold sits below the skip threshold, so some listens
 * satisfy both rules and the ordering decides. Tracks over 2.5 minutes.
 */
export function hasOverlappingThresholds(durationMs: number): boolean {
  return skipThresholdMs(durationMs) > playThresholdMs(durationMs);
}

/**
 * True when the two thresholds leave a band that is neither, which is where
 * `partial` earns its place. Tracks under 2.5 minutes.
 */
export function hasThresholdGap(durationMs: number): boolean {
  return durationMs > 0 && skipThresholdMs(durationMs) < playThresholdMs(durationMs);
}
