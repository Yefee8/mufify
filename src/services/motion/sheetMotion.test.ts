import {
  ANIMATION_SPEEDS,
  dampingRatio,
  isInstant,
  naturalFrequency,
  SHEET_SPRING,
  sheetSpring,
  SPEED_MULTIPLIERS,
} from './sheetMotion';

/**
 * The scaling has one job and one trap.
 *
 * The job: "fast" should take half as long. The trap: a spring has no duration
 * to halve, so it has to go through the physics — and scaling stiffness alone
 * changes the damping ratio, which is the number that was actually tuned. A
 * faster animation that is also more damped arrives sluggish, which is the
 * opposite of what the setting says on the label.
 */
describe('sheetSpring', () => {
  it('returns the tuned spring unchanged at normal speed', () => {
    const spring = sheetSpring(0, 1);

    expect(spring.damping).toBe(SHEET_SPRING.damping);
    expect(spring.stiffness).toBe(SHEET_SPRING.stiffness);
    expect(spring.mass).toBe(SHEET_SPRING.mass);
  });

  it('keeps the damping ratio at every speed', () => {
    const tuned = dampingRatio(SHEET_SPRING);

    for (const speed of ANIMATION_SPEEDS) {
      const spring = sheetSpring(0, SPEED_MULTIPLIERS[speed]);
      expect(dampingRatio(spring)).toBeCloseTo(tuned, 10);
    }
  });

  it('is tuned to overshoot by a hair rather than arrive with a snap', () => {
    // ζ ≈ 0.86: under 1 so it overshoots at all, well over 0.7 so it does it
    // once. The value it replaced was 0.75.
    expect(dampingRatio(SHEET_SPRING)).toBeGreaterThan(0.8);
    expect(dampingRatio(SHEET_SPRING)).toBeLessThan(0.95);
  });

  it('halving the multiplier doubles the natural frequency', () => {
    // Settling time is proportional to 1 / (ζ · ω₀), and ζ is held constant,
    // so twice the frequency is half the time.
    const normal = naturalFrequency(sheetSpring(0, 1));
    const fast = naturalFrequency(sheetSpring(0, 0.5));

    expect(fast).toBeCloseTo(normal * 2, 10);
  });

  it('scales the time by the multiplier for any multiplier', () => {
    for (const multiplier of [0.25, 0.5, 0.75, 1, 2]) {
      const scaled = naturalFrequency(sheetSpring(0, multiplier));
      expect(scaled).toBeCloseTo(naturalFrequency(SHEET_SPRING) / multiplier, 10);
    }
  });

  it('passes the gesture velocity through untouched', () => {
    // The finger's real speed, in expansion units per second. The spring runs
    // in real seconds whatever its stiffness, so rescaling this would make a
    // flick hand over the wrong amount of momentum.
    for (const multiplier of [0.5, 1]) {
      expect(sheetSpring(3.2, multiplier).velocity).toBe(3.2);
    }
  });

  it('returns a usable spring at the instant multiplier rather than dividing by zero', () => {
    // Callers are expected to check `isInstant` and skip the animation, but a
    // config full of Infinity would be a crash waiting for the one that does not.
    const spring = sheetSpring(0, SPEED_MULTIPLIERS.instant);

    expect(Number.isFinite(spring.stiffness)).toBe(true);
    expect(Number.isFinite(spring.damping)).toBe(true);
  });
});

describe('isInstant', () => {
  it('is true only for the instant speed', () => {
    expect(isInstant(SPEED_MULTIPLIERS.instant)).toBe(true);
    expect(isInstant(SPEED_MULTIPLIERS.fast)).toBe(false);
    expect(isInstant(SPEED_MULTIPLIERS.normal)).toBe(false);
  });

  it('treats a negative multiplier as instant rather than animating backwards', () => {
    expect(isInstant(-1)).toBe(true);
  });
});

describe('SPEED_MULTIPLIERS', () => {
  it('covers every offered speed', () => {
    for (const speed of ANIMATION_SPEEDS) {
      expect(typeof SPEED_MULTIPLIERS[speed]).toBe('number');
    }
  });

  it('orders them from slowest to fastest', () => {
    expect(SPEED_MULTIPLIERS.normal).toBeGreaterThan(SPEED_MULTIPLIERS.fast);
    expect(SPEED_MULTIPLIERS.fast).toBeGreaterThan(SPEED_MULTIPLIERS.instant);
  });
});
