import {
  classifyListen,
  hasAmbiguousThresholds,
  playThresholdMs,
  skipThresholdMs,
} from './playCounting';

const FOUR_MINUTES = 240_000;
const TWENTY_SECONDS = 20_000;
const TWO_MINUTES = 120_000;

describe('thresholds', () => {
  it('caps the play threshold at 30 seconds for a long track', () => {
    expect(playThresholdMs(FOUR_MINUTES)).toBe(30_000);
  });

  it('halves it for a track shorter than a minute', () => {
    expect(playThresholdMs(TWENTY_SECONDS)).toBe(10_000);
  });

  it('puts the skip threshold at a fifth of the duration', () => {
    expect(skipThresholdMs(FOUR_MINUTES)).toBe(48_000);
  });
});

describe('classifyListen — unambiguous durations', () => {
  it('counts a full listen as a play', () => {
    expect(classifyListen(FOUR_MINUTES, FOUR_MINUTES)).toBe('play');
  });

  it('counts abandoning it immediately as a skip', () => {
    expect(classifyListen(2_000, FOUR_MINUTES)).toBe('skip');
  });

  it('counts half of a short track as a play', () => {
    expect(classifyListen(10_000, TWENTY_SECONDS)).toBe('play');
  });

  it('treats the play threshold as inclusive', () => {
    expect(classifyListen(10_000, TWENTY_SECONDS)).toBe('play');
    expect(classifyListen(9_999, TWENTY_SECONDS)).toBe('partial');
  });

  it('treats the skip threshold as exclusive', () => {
    expect(classifyListen(3_999, TWENTY_SECONDS)).toBe('skip');
    expect(classifyListen(4_000, TWENTY_SECONDS)).toBe('partial');
  });

  it('leaves the middle of a two-minute track as neither', () => {
    // 24s is under the 30s play mark and over the 24s skip mark.
    expect(classifyListen(25_000, TWO_MINUTES)).toBe('partial');
  });

  it('rejects nonsense input rather than guessing', () => {
    expect(classifyListen(0, FOUR_MINUTES)).toBe('partial');
    expect(classifyListen(1_000, 0)).toBe('partial');
    expect(classifyListen(-1, FOUR_MINUTES)).toBe('partial');
  });
});

describe('classifyListen — the overlapping region', () => {
  /*
   * Documented in playCounting.ts and awaiting a decision. These tests pin the
   * current behaviour so that changing it is a deliberate act with a visible
   * diff, not an accident.
   */

  it('flags durations where the two rules disagree', () => {
    // Anything past 2.5 minutes: duration * 0.2 overtakes the 30s cap.
    expect(hasAmbiguousThresholds(TWO_MINUTES)).toBe(false);
    expect(hasAmbiguousThresholds(150_000)).toBe(false);
    expect(hasAmbiguousThresholds(150_001)).toBe(true);
    expect(hasAmbiguousThresholds(FOUR_MINUTES)).toBe(true);
  });

  it('resolves the overlap in favour of a play', () => {
    // 40s of a 4-minute track: past the 30s play mark, under the 48s skip mark.
    expect(classifyListen(40_000, FOUR_MINUTES)).toBe('play');
  });

  it('never reports the same listen as both', () => {
    const durations = [TWENTY_SECONDS, TWO_MINUTES, FOUR_MINUTES, 600_000];
    for (const duration of durations) {
      for (let played = 0; played <= duration; played += duration / 40) {
        expect(['play', 'skip', 'partial']).toContain(classifyListen(played, duration));
      }
    }
  });
});
