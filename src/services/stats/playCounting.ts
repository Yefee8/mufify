/**
 * The rule that decides whether listening to something counted.
 *
 * Pure, so it is unit tested and so the stats screens can never disagree with
 * the recorder about what a play is.
 */

export type ListenOutcome = 'play' | 'skip' | 'partial';

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
 * > **The two thresholds overlap, and this needs a decision.** For anything
 * > longer than 2.5 minutes, `duration * 0.2` is past the 30-second play mark,
 * > so a 4-minute track listened to for 40 seconds satisfies *both* rules —
 * > it is over the 30s play threshold and under the 48s skip threshold. Most
 * > songs are longer than 2.5 minutes, so this is the common case, not an edge
 * > case.
 * >
 * > Until that is settled, **play wins**: the positive event is checked first,
 * > and the overlap region counts as a play and not a skip. That keeps play
 * > counts honest and under-reports skips. The alternative reading — that a
 * > skip means "did not finish", so the skip test should win — would make a
 * > 40-second listen to a 4-minute track a skip *and* not a play, which is
 * > defensible but changes every rollup.
 * >
 * > Changing this is one branch here plus its tests. Changing it after Phase 7
 * > ships means rebuilding every rollup.
 */
export function classifyListen(msPlayed: number, durationMs: number): ListenOutcome {
  if (durationMs <= 0 || msPlayed <= 0) return 'partial';

  if (msPlayed >= playThresholdMs(durationMs)) return 'play';
  if (msPlayed < skipThresholdMs(durationMs)) return 'skip';

  return 'partial';
}

/** True when the thresholds overlap for this duration — see `classifyListen`. */
export function hasAmbiguousThresholds(durationMs: number): boolean {
  return skipThresholdMs(durationMs) > playThresholdMs(durationMs);
}
