import { playThresholdMs } from './playCounting';

/**
 * When playing the same track again counts as a second listen.
 *
 * A layer *on top of* the play/skip/partial rule, not a change to it. ADR 005
 * decides whether a listen counted; this decides where one listen ends and the
 * next begins while the track never changes. Looping a song five times is five
 * listens, and until now it was one — the engine only closed a listen when the
 * loaded track changed, so a repeat-one all afternoon recorded a single play.
 *
 * See `docs/adr/011-repeat-listen-detection.md`.
 */

/**
 * How far back the position must jump to start a new listen.
 *
 * A quarter of the track. The number has to separate two things that look
 * identical from the outside — "start it again" and "go back a bit" — and the
 * only signal available is how far back the position went.
 *
 * A tighter bound would count a scrub back over the last chorus as a replay; a
 * looser one would miss a genuine restart on a track someone had nearly
 * finished. A quarter means the listener has given up at least three quarters
 * of their progress, which is a decision rather than an adjustment.
 */
export const REWIND_FRACTION = 0.25;

export interface RewindCheck {
  /** Position on the previous status tick. */
  previousPositionMs: number;
  /** Position now. */
  positionMs: number;
  durationMs: number;
  /** Playback time accumulated since this listen began. */
  msPlayedInCycle: number;
}

/**
 * True when the current listen should be banked and a fresh one started.
 *
 * Two conditions, and both matter:
 *
 * **The current listen must already have earned a play.** Without this, seeking
 * around inside the first thirty seconds of a track would shatter one listen
 * into a dozen, each too short to count as anything — turning a real play into
 * a pile of skips. A listen that has not yet counted has nothing worth banking.
 *
 * **The position must have jumped back past the rewind mark.** Both a loop to
 * zero and a manual drag to the start satisfy it; nudging back a few seconds
 * does not.
 *
 * Note what this deliberately does *not* require: that the new listen goes on to
 * pass the play threshold too. It does not need to be checked here, because the
 * new listen is classified by the same rule as every other one when it ends. If
 * the user rewinds and then leaves, the second listen is recorded as a skip,
 * which is what happened.
 */
export function isRewindToRestart({
  previousPositionMs,
  positionMs,
  durationMs,
  msPlayedInCycle,
}: RewindCheck): boolean {
  if (durationMs <= 0) return false;

  // Nothing worth banking yet.
  if (msPlayedInCycle < playThresholdMs(durationMs)) return false;

  // Forward, or standing still. Ordinary playback.
  if (positionMs >= previousPositionMs) return false;

  return positionMs <= durationMs * REWIND_FRACTION;
}
