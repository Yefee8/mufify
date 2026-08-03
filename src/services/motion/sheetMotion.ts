/**
 * The one settle every root-level sheet uses.
 *
 * Now Playing was tuned by hand and the user confirmed it reads right; the
 * queue was written separately with Reanimated's `SlideInDown`/`SlideOutDown`
 * layout animations and read badly. The difference was never taste. The queue
 * had a spring on the way in and a plain timing on the way out, no mass term
 * so its damping ratio was not the one that was tuned, no velocity handoff,
 * and no opacity ramp at all.
 *
 * So the numbers live here, once, and the sheet primitive is the only thing
 * that reads them. A third sheet — add-to-playlist, a Wrapped view — gets the
 * tuned motion by construction rather than by somebody remembering to copy it.
 */

/** 0 closed, 1 open. Everything below is expressed against that range. */
export interface SpringConfig {
  damping: number;
  stiffness: number;
  mass: number;
  velocity: number;
}

/**
 * ζ ≈ 0.86 — overshoots by a hair and comes to rest, which is what a sheet
 * does. Measured against `damping: 24, stiffness: 260` with no mass term
 * (ζ ≈ 0.75), which arrived with a snap.
 */
export const SHEET_SPRING = { damping: 22, stiffness: 180, mass: 0.9 } as const;

/**
 * How much of the travel the fade takes.
 *
 * Tracking the whole gesture leaves the surface half transparent at the
 * midpoint, so the screen underneath reads through it and the whole thing
 * becomes a cross-fade between two screens rather than one sheet arriving over
 * another. Finishing early makes it a sheet; the movement carries the rest.
 */
export const SHEET_FADE_COMPLETE_AT = 0.4;

/**
 * Duration multipliers offered in Settings.
 *
 * Fixed steps rather than a slider, matching how every other scale in this
 * project works — there is no arbitrary spacing value either. `instant` is 0
 * and means "do not animate", which the primitive special-cases rather than
 * trying to express as an infinitely stiff spring.
 */
export const ANIMATION_SPEEDS = ['normal', 'fast', 'instant'] as const;
export type AnimationSpeed = (typeof ANIMATION_SPEEDS)[number];

export const SPEED_MULTIPLIERS: Record<AnimationSpeed, number> = {
  normal: 1,
  fast: 0.5,
  instant: 0,
};

/** True when the value should be assigned rather than animated to. */
export function isInstant(multiplier: number): boolean {
  return multiplier <= 0;
}

/**
 * The tuned spring, rescaled to take `multiplier` times as long.
 *
 * A spring has no duration to multiply, so the scaling goes through its
 * physics. Settling time is proportional to `1 / (ζ · ω₀)` where
 * `ω₀ = √(k/m)`, so dividing stiffness by `multiplier²` divides ω₀ by
 * `multiplier` and multiplies the time by it. Damping then has to be divided
 * by `multiplier` as well, because ζ = `c / (2√(km))` — leaving it alone would
 * make a faster animation progressively more damped, and "fast" would arrive
 * sluggish instead of quick.
 *
 * `velocity` is deliberately not scaled. It is the finger's real speed at the
 * moment it left the screen, in expansion units per second, and the spring
 * still runs in real seconds whatever its stiffness.
 */
export function sheetSpring(velocity: number, multiplier: number): SpringConfig {
  const scale = isInstant(multiplier) ? 1 : multiplier;

  return {
    damping: SHEET_SPRING.damping / scale,
    stiffness: SHEET_SPRING.stiffness / (scale * scale),
    mass: SHEET_SPRING.mass,
    velocity,
  };
}

/** The damping ratio of a config — ζ = c / (2√(km)). Used by its tests. */
export function dampingRatio(config: Pick<SpringConfig, 'damping' | 'stiffness' | 'mass'>): number {
  return config.damping / (2 * Math.sqrt(config.stiffness * config.mass));
}

/** Undamped natural frequency, in radians per second. Used by its tests. */
export function naturalFrequency(config: Pick<SpringConfig, 'stiffness' | 'mass'>): number {
  return Math.sqrt(config.stiffness / config.mass);
}
