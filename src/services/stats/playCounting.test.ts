import {
  classifyListen,
  hasOverlappingThresholds,
  hasThresholdGap,
  playThresholdMs,
  skipThresholdMs,
  THRESHOLD_CROSSOVER_MS,
} from './playCounting';

const FOUR_MINUTES = 240_000;
const TWO_MINUTES = 120_000;
const TWENTY_SECONDS = 20_000;

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

  it('crosses at 2.5 minutes', () => {
    expect(playThresholdMs(THRESHOLD_CROSSOVER_MS)).toBe(skipThresholdMs(THRESHOLD_CROSSOVER_MS));
    expect(hasOverlappingThresholds(THRESHOLD_CROSSOVER_MS)).toBe(false);
    expect(hasThresholdGap(THRESHOLD_CROSSOVER_MS)).toBe(false);
  });
});

describe('classifyListen — the ordinary cases', () => {
  it('counts a full listen as a play', () => {
    expect(classifyListen(FOUR_MINUTES, FOUR_MINUTES)).toBe('play');
  });

  it('counts abandoning it immediately as a skip', () => {
    expect(classifyListen(2_000, FOUR_MINUTES)).toBe('skip');
  });

  it('treats the play threshold as inclusive', () => {
    expect(classifyListen(30_000, FOUR_MINUTES)).toBe('play');
    expect(classifyListen(29_999, FOUR_MINUTES)).toBe('skip');
  });

  it('treats the skip threshold as exclusive', () => {
    expect(classifyListen(3_999, TWENTY_SECONDS)).toBe('skip');
    expect(classifyListen(4_000, TWENTY_SECONDS)).toBe('partial');
  });

  it('rejects nonsense input rather than guessing', () => {
    expect(classifyListen(0, FOUR_MINUTES)).toBe('partial');
    expect(classifyListen(1_000, 0)).toBe('partial');
    expect(classifyListen(-1, FOUR_MINUTES)).toBe('partial');
  });
});

describe('classifyListen — overlap region, over 2.5 minutes', () => {
  /*
   * Play threshold (30s) sits BELOW the skip threshold, so a band of listens
   * satisfies both rules. Ordered evaluation resolves it: play wins.
   */

  it('reports the regime', () => {
    expect(hasOverlappingThresholds(THRESHOLD_CROSSOVER_MS + 1)).toBe(true);
    expect(hasOverlappingThresholds(FOUR_MINUTES)).toBe(true);
    expect(hasThresholdGap(FOUR_MINUTES)).toBe(false);
  });

  it('resolves the overlapping band in favour of a play', () => {
    // 4-minute track: play at >= 30s, skip at < 48s. 30s–48s is both.
    expect(classifyListen(30_000, FOUR_MINUTES)).toBe('play');
    expect(classifyListen(40_000, FOUR_MINUTES)).toBe('play');
    expect(classifyListen(47_999, FOUR_MINUTES)).toBe('play');
  });

  it('still skips below the play threshold', () => {
    expect(classifyListen(29_999, FOUR_MINUTES)).toBe('skip');
  });

  it('never returns partial here — the bands leave no hole', () => {
    for (let played = 1; played <= FOUR_MINUTES; played += 1_000) {
      expect(classifyListen(played, FOUR_MINUTES)).not.toBe('partial');
    }
  });
});

describe('classifyListen — gap region, under 2.5 minutes', () => {
  /*
   * Skip threshold sits BELOW the play threshold, leaving a band that is
   * neither. Without a third outcome those listens would vanish silently.
   */

  it('reports the regime', () => {
    expect(hasThresholdGap(TWENTY_SECONDS)).toBe(true);
    expect(hasThresholdGap(TWO_MINUTES)).toBe(true);
    expect(hasOverlappingThresholds(TWO_MINUTES)).toBe(false);
  });

  it('calls the gap partial rather than losing it', () => {
    // 20s track: skip below 4s, play at or above 10s. 4s–10s is the gap.
    expect(classifyListen(4_000, TWENTY_SECONDS)).toBe('partial');
    expect(classifyListen(7_000, TWENTY_SECONDS)).toBe('partial');
    expect(classifyListen(9_999, TWENTY_SECONDS)).toBe('partial');
  });

  it('keeps the outer bands intact around the gap', () => {
    expect(classifyListen(3_999, TWENTY_SECONDS)).toBe('skip');
    expect(classifyListen(10_000, TWENTY_SECONDS)).toBe('play');
  });

  it('leaves a gap on a two-minute track too', () => {
    // 2-minute track: skip below 24s, play at or above 30s.
    expect(classifyListen(23_999, TWO_MINUTES)).toBe('skip');
    expect(classifyListen(25_000, TWO_MINUTES)).toBe('partial');
    expect(classifyListen(30_000, TWO_MINUTES)).toBe('play');
  });
});

describe('classifyListen — total coverage', () => {
  it('always returns exactly one of the three outcomes', () => {
    const durations = [
      1_000,
      TWENTY_SECONDS,
      60_000,
      TWO_MINUTES,
      THRESHOLD_CROSSOVER_MS,
      FOUR_MINUTES,
      3_600_000,
    ];
    for (const duration of durations) {
      for (let played = 0; played <= duration; played += Math.max(duration / 50, 1)) {
        expect(['play', 'skip', 'partial']).toContain(classifyListen(played, duration));
      }
    }
  });

  it('is monotonic — listening longer never downgrades the outcome', () => {
    const rank = { skip: 0, partial: 1, play: 2 } as const;
    for (const duration of [TWENTY_SECONDS, TWO_MINUTES, FOUR_MINUTES]) {
      let previous = -1;
      for (let played = 1; played <= duration; played += duration / 100) {
        const current = rank[classifyListen(played, duration)];
        expect(current).toBeGreaterThanOrEqual(previous);
        previous = current;
      }
    }
  });
});
