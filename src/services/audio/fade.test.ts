import { fadeGain, fadeOutDelay, MIN_FADE_MS, VolumeFade, type FadeTimers } from './fade';

/**
 * The ramp at a track boundary.
 *
 * Two things here are audible when wrong, which is why they are pinned. A ramp
 * that is cancelled must land on its target rather than freeze where it was —
 * otherwise skipping during a fade-out leaves the next track playing at a third
 * of its level, and the bug reads as a broken volume control. And the fade-out
 * has to be scheduled a status update early, because updates arrive twice a
 * second and waiting for the exact position means missing the window on every
 * track whose updates straddle it.
 */

/** A hand-cranked clock: no real timers, and every tick is deliberate. */
function fakeTimers(): FadeTimers & { tick: (times: number) => void; running: boolean } {
  let callback: (() => void) | null = null;

  return {
    setInterval: (fn) => {
      callback = fn;
      return 1 as unknown as ReturnType<typeof setInterval>;
    },
    clearInterval: () => {
      callback = null;
    },
    tick: (times: number) => {
      for (let index = 0; index < times; index += 1) callback?.();
    },
    get running() {
      return callback !== null;
    },
  };
}

describe('fadeGain', () => {
  it('starts at the start and ends at the end', () => {
    expect(fadeGain(0, 1, 0)).toBeCloseTo(0);
    expect(fadeGain(0, 1, 1)).toBeCloseTo(1);
  });

  it('rises through the middle rather than jumping at either end', () => {
    const middle = fadeGain(0, 1, 0.5);

    expect(middle).toBeGreaterThan(0.2);
    expect(middle).toBeLessThan(0.8);
  });

  it('runs downhill just as well', () => {
    expect(fadeGain(1, 0, 0)).toBeCloseTo(1);
    expect(fadeGain(1, 0, 1)).toBeCloseTo(0);
    expect(fadeGain(1, 0, 0.25)).toBeGreaterThan(fadeGain(1, 0, 0.75));
  });

  it('is monotonic, so a fade never audibly backtracks', () => {
    let previous = -1;
    for (let step = 0; step <= 20; step += 1) {
      const gain = fadeGain(0, 1, step / 20);
      expect(gain).toBeGreaterThanOrEqual(previous);
      previous = gain;
    }
  });

  it('clamps progress rather than overshooting the target', () => {
    // A timer that fires late must not drive the gain past 1.0, which some
    // platforms accept and then clip.
    expect(fadeGain(0, 1, 3)).toBeCloseTo(1);
    expect(fadeGain(0, 1, -2)).toBeCloseTo(0);
    expect(fadeGain(0, 1, Number.NaN)).toBeCloseTo(1);
  });
});

describe('VolumeFade', () => {
  it('applies the target outright for a fade too short to hear as one', () => {
    const applied: number[] = [];
    const timers = fakeTimers();
    new VolumeFade((gain) => applied.push(gain), timers).run(0, 1, MIN_FADE_MS - 1);

    expect(applied).toEqual([1]);
    expect(timers.running).toBe(false);
  });

  it('ramps to the target and stops itself there', () => {
    const applied: number[] = [];
    const timers = fakeTimers();
    new VolumeFade((gain) => applied.push(gain), timers).run(0, 1, 330);

    timers.tick(20);

    expect(applied[0]).toBeCloseTo(0);
    expect(applied[applied.length - 1]).toBeCloseTo(1);
    expect(timers.running).toBe(false);
  });

  it('lands on the target when cancelled, never in between', () => {
    /*
     * The regression this exists for. Freezing at 0.3 would leave the *next*
     * track playing at a third of its level for its whole length, and the
     * symptom — quiet playback after a skip — points nowhere near a fade.
     */
    const applied: number[] = [];
    const timers = fakeTimers();
    const fade = new VolumeFade((gain) => applied.push(gain), timers);

    fade.run(1, 0, 1000);
    timers.tick(3);
    fade.settle();

    expect(applied[applied.length - 1]).toBe(0);
    expect(timers.running).toBe(false);
  });

  it('goes to full gain on reset, whichever way it was heading', () => {
    const applied: number[] = [];
    const timers = fakeTimers();
    const fade = new VolumeFade((gain) => applied.push(gain), timers);

    fade.run(1, 0, 1000);
    timers.tick(2);
    fade.reset();

    expect(applied[applied.length - 1]).toBe(1);
    expect(fade.heading).toBe(1);
  });

  it('replaces a running ramp rather than running two at once', () => {
    const applied: number[] = [];
    const timers = fakeTimers();
    const fade = new VolumeFade((gain) => applied.push(gain), timers);

    fade.run(1, 0, 1000);
    timers.tick(2);
    fade.run(0, 1, 330);
    timers.tick(20);

    expect(applied[applied.length - 1]).toBeCloseTo(1);
    expect(fade.isRunning).toBe(false);
  });

  it('reports where it is heading, so a caller can tell out from in', () => {
    const timers = fakeTimers();
    const fade = new VolumeFade(() => undefined, timers);

    fade.run(1, 0, 1000);
    expect(fade.heading).toBe(0);

    fade.run(0, 1, 1000);
    expect(fade.heading).toBe(1);
  });
});

describe('fadeOutDelay', () => {
  const INTERVAL = 500;

  it('says nothing while the end is further off than the next update', () => {
    expect(fadeOutDelay(0, 200_000, 1000, INTERVAL)).toBeNull();
  });

  it('schedules once the end is within a fade plus one update', () => {
    // A status early, deliberately: updates land twice a second, so waiting for
    // the position to be exactly `duration - fade` misses the window on every
    // track whose updates straddle it.
    expect(fadeOutDelay(198_600, 200_000, 1000, INTERVAL)).toBe(400);
  });

  it('starts immediately when the update already arrived inside the fade', () => {
    expect(fadeOutDelay(199_500, 200_000, 1000, INTERVAL)).toBe(0);
  });

  it('says nothing once the track is over', () => {
    expect(fadeOutDelay(200_000, 200_000, 1000, INTERVAL)).toBeNull();
    expect(fadeOutDelay(201_000, 200_000, 1000, INTERVAL)).toBeNull();
  });

  it('is off when the setting is off', () => {
    expect(fadeOutDelay(199_000, 200_000, 0, INTERVAL)).toBeNull();
  });

  it('refuses a duration it cannot trust', () => {
    // A stream, or a track whose duration has not arrived yet. Fading against
    // a made-up end is worse than not fading.
    expect(fadeOutDelay(1000, 0, 1000, INTERVAL)).toBeNull();
    expect(fadeOutDelay(1000, Number.NaN, 1000, INTERVAL)).toBeNull();
    expect(fadeOutDelay(1000, Number.POSITIVE_INFINITY, 1000, INTERVAL)).toBeNull();
  });

  it('fades whatever is left of a track shorter than the fade', () => {
    // An interlude of half a second with a two-second fade set. Starting at
    // once and fading what remains beats not fading at all.
    expect(fadeOutDelay(0, 500, 2000, INTERVAL)).toBe(0);
  });
});
