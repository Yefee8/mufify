import { playThresholdMs } from './playCounting';
import { isRewindToRestart, REWIND_FRACTION } from './repeatListen';

/**
 * The thresholds are pinned here on purpose.
 *
 * This rule decides whether a listen is counted once or twice, so a quiet
 * change to either condition silently rewrites the user's history. Every test
 * below names the behaviour it is protecting rather than the number.
 */

/** Four minutes: long enough that the play threshold is the flat 30 seconds. */
const LONG = 240_000;
/** Six seconds, like the short test files. Threshold is half of it. */
const SHORT = 6_000;

function check(over: Partial<Parameters<typeof isRewindToRestart>[0]> = {}) {
  return isRewindToRestart({
    previousPositionMs: 120_000,
    positionMs: 0,
    durationMs: LONG,
    msPlayedInCycle: playThresholdMs(LONG),
    ...over,
  });
}

describe('isRewindToRestart', () => {
  it('starts a new listen when a counted track loops back to zero', () => {
    // The case this whole rule exists for: repeat-one all afternoon used to be
    // recorded as a single play.
    expect(check({ positionMs: 0 })).toBe(true);
  });

  it('starts a new listen when the user drags back to the beginning', () => {
    expect(check({ previousPositionMs: 200_000, positionMs: 4_000 })).toBe(true);
  });

  it('does not start one before the current listen has counted', () => {
    /*
     * Without this, scrubbing around inside the first thirty seconds would
     * shatter one listen into a dozen too short to count — turning a real play
     * into a pile of skips.
     */
    expect(check({ msPlayedInCycle: playThresholdMs(LONG) - 1 })).toBe(false);
  });

  it('does not treat a small step backwards as a restart', () => {
    // Going back over the last chorus is an adjustment, not a replay.
    expect(check({ previousPositionMs: 200_000, positionMs: 185_000 })).toBe(false);
  });

  it('does not fire while playback moves forward', () => {
    expect(check({ previousPositionMs: 60_000, positionMs: 60_500 })).toBe(false);
  });

  it('does not fire when the position has not moved', () => {
    // A paused track keeps reporting the same position. It is not restarting.
    expect(check({ previousPositionMs: 90_000, positionMs: 90_000 })).toBe(false);
  });

  it('draws the line exactly at a quarter of the track', () => {
    const boundary = LONG * REWIND_FRACTION;
    expect(check({ previousPositionMs: 200_000, positionMs: boundary })).toBe(true);
    expect(check({ previousPositionMs: 200_000, positionMs: boundary + 1 })).toBe(false);
  });

  it('works on a track short enough that the threshold is half its length', () => {
    // A six-second file counts as played after three seconds, so looping it
    // has to produce a second listen just as a four-minute one does.
    expect(
      isRewindToRestart({
        previousPositionMs: 5_800,
        positionMs: 0,
        durationMs: SHORT,
        msPlayedInCycle: playThresholdMs(SHORT),
      }),
    ).toBe(true);
  });

  it('refuses to guess when the duration is unknown', () => {
    // Duration is zero until the file is open. Every fraction of zero is zero,
    // so without this guard a track would "restart" on its first status tick.
    expect(check({ durationMs: 0 })).toBe(false);
  });

  it('counts a rewind-then-leave as its own short listen rather than nothing', () => {
    /*
     * The boundary fires on the rewind, not on the second listen reaching the
     * threshold. That is deliberate: the new listen is classified by the same
     * rule as any other when it ends, so abandoning it records a skip — which
     * is what happened — instead of silently merging into the previous play.
     */
    expect(check({ previousPositionMs: 239_000, positionMs: 0 })).toBe(true);
  });
});

/**
 * The rule applied to a run of status ticks, the way the engine applies it.
 *
 * `isRewindToRestart` is a single decision; what matters to a user is how many
 * listens a *session* produces. This walks realistic tick sequences and counts
 * the boundaries, which is the behaviour the feature was asked for — and it is
 * deterministic, unlike watching a six-second file loop on an emulator.
 */
function countBoundaries(positions: readonly number[], durationMs: number): number {
  let previous = 0;
  let msPlayedInCycle = 0;
  let boundaries = 0;

  for (const positionMs of positions) {
    if (
      isRewindToRestart({
        previousPositionMs: previous,
        positionMs,
        durationMs,
        msPlayedInCycle,
      })
    ) {
      boundaries += 1;
      msPlayedInCycle = 0;
    } else {
      /*
       * Credit only forward movement. The engine accumulates wall-clock time
       * spent playing, which for ordinary playback is the position delta — and
       * a backwards jump adds nothing, because seeking is not listening. An
       * earlier version of this harness advanced a fixed amount per tick, which
       * quietly made every position jump free and produced a failure that
       * looked like a bug in the rule.
       */
      msPlayedInCycle += Math.max(0, positionMs - previous);
    }
    previous = positionMs;
  }

  return boundaries;
}

/** Ticks for one pass through a track, then back to zero. */
function loop(durationMs: number, tickMs = 500): number[] {
  const ticks: number[] = [];
  for (let at = tickMs; at < durationMs; at += tickMs) ticks.push(at);
  ticks.push(0);
  return ticks;
}

describe('over a run of status ticks', () => {
  it('turns three loops of one track into three extra listens', () => {
    // The headline case from the brief: a song looped three times is three
    // plays, not one.
    const ticks = [...loop(SHORT), ...loop(SHORT), ...loop(SHORT)];
    expect(countBoundaries(ticks, SHORT)).toBe(3);
  });

  it('counts a manual drag back to the start once', () => {
    // Play well past the threshold, then drag the scrubber to the beginning.
    const ticks = [30_000, 60_000, 90_000, 0, 500, 1_000];
    expect(countBoundaries(ticks, LONG)).toBe(1);
  });

  it('ignores scrubbing around before the listen has counted', () => {
    /*
     * Someone hunting for the right moment in the first few seconds. Every one
     * of these is a backwards jump below the quarter mark, and none of them may
     * split the listen — otherwise a real play is recorded as a pile of skips.
     */
    const ticks = [2_000, 500, 4_000, 1_000, 6_000, 2_000, 8_000];
    expect(countBoundaries(ticks, LONG)).toBe(0);
  });

  it('ignores repeated short rewinds late in a counted track', () => {
    // Replaying the last chorus four times is one listen, not five.
    const ticks = [30_000, 200_000, 180_000, 200_000, 180_000, 200_000, 180_000];
    expect(countBoundaries(ticks, LONG)).toBe(0);
  });

  it('does not split a track played straight through', () => {
    const ticks = loop(LONG, 10_000).slice(0, -1);
    expect(countBoundaries(ticks, LONG)).toBe(0);
  });
});
