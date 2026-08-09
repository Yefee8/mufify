import type { CurvePoint } from './presets';

/**
 * Sampling a preset's curve onto the bands a device actually has.
 *
 * Every number the platform equaliser takes is in **millibels** — hundredths
 * of a decibel — and every number the app reasons about is in decibels. The
 * conversion lives here so that one unit crosses the boundary and one unit
 * appears in the UI, rather than both appearing in both.
 */

/** Millibels per decibel. */
const MB_PER_DB = 100;

/**
 * The gain a curve asks for at one frequency.
 *
 * Interpolated on a **logarithmic** frequency axis, because hearing is: the
 * distance from 60Hz to 120Hz is one octave and so is 6kHz to 12kHz, and
 * interpolating linearly would put almost the whole curve in the top two
 * bands. Outside the curve's ends the nearest value holds, so a device with a
 * 31Hz band does not fall off the bottom of a preset that starts at 60.
 */
export function gainAt(points: readonly CurvePoint[], hz: number): number {
  if (points.length === 0) return 0;

  const first = points[0];
  const last = points[points.length - 1];
  if (first === undefined || last === undefined) return 0;

  if (hz <= first.hz) return first.db;
  if (hz >= last.hz) return last.db;

  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const next = points[index];
    if (previous === undefined || next === undefined) continue;
    if (hz > next.hz) continue;

    const span = Math.log(next.hz) - Math.log(previous.hz);
    // Two points at the same frequency: the later one wins rather than a
    // division by zero.
    if (span === 0) return next.db;

    const position = (Math.log(hz) - Math.log(previous.hz)) / span;
    return previous.db + position * (next.db - previous.db);
  }

  return last.db;
}

export interface BandRange {
  minLevelMb: number;
  maxLevelMb: number;
}

/**
 * A preset's curve as one millibel level per device band.
 *
 * Clamped to what the device accepts: `Equalizer.setBandLevel` throws rather
 * than saturating when handed a level outside its range, and the presets are
 * written without knowing any particular device's limits.
 */
export function curveForBands(
  points: readonly CurvePoint[],
  centerFrequencies: readonly number[],
  range: BandRange,
): number[] {
  return centerFrequencies.map((hz) => clampMb(Math.round(gainAt(points, hz) * MB_PER_DB), range));
}

/** Keep a millibel level inside what the device will accept. */
export function clampMb(millibels: number, range: BandRange): number {
  // A device reporting an inverted range would otherwise make `coerceIn`
  // meaningless; the lower of the two is the floor whatever it is called.
  const low = Math.min(range.minLevelMb, range.maxLevelMb);
  const high = Math.max(range.minLevelMb, range.maxLevelMb);
  if (!Number.isFinite(millibels)) return 0;
  return Math.min(high, Math.max(low, millibels));
}

export function dbToMb(db: number): number {
  return Math.round(db * MB_PER_DB);
}

export function mbToDb(millibels: number): number {
  return millibels / MB_PER_DB;
}

/**
 * Fit stored custom levels to the bands in front of us.
 *
 * Custom is held per band index, so a device with a different number of bands
 * — a restore onto a new phone, or an OEM effect swapped underneath — would
 * otherwise leave the array and the sliders disagreeing about length. Missing
 * bands sit flat; extra ones are dropped.
 */
export function fitLevels(
  stored: readonly number[],
  bandCount: number,
  range: BandRange,
): number[] {
  return Array.from({ length: bandCount }, (_, index) => clampMb(stored[index] ?? 0, range));
}

/**
 * A frequency as a person reads it: `60 Hz`, `1.6 kHz`, `16 kHz`.
 *
 * Fractional kilohertz only when it says something — `1.6 kHz` is worth the
 * character and `16.0 kHz` is not.
 */
export function formatFrequency(hz: number): string {
  if (hz < 1000) return `${Math.round(hz)} Hz`;
  const kilohertz = hz / 1000;
  const rounded = Math.round(kilohertz * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded} kHz` : `${rounded.toFixed(1)} kHz`;
}

/** A gain as a person reads it, always signed so zero is visibly the middle. */
export function formatGain(db: number): string {
  const rounded = Math.round(db * 10) / 10;
  if (Object.is(rounded, -0) || rounded === 0) return '0 dB';
  const sign = rounded > 0 ? '+' : '−';
  const magnitude = Math.abs(rounded);
  const text = Number.isInteger(magnitude) ? `${magnitude}` : magnitude.toFixed(1);
  return `${sign}${text} dB`;
}
