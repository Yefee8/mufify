import { gainAt } from './curve';
import type { CurvePoint } from './presets';

/** The audible range the thumbnail spans, log-spaced between these two. */
const LOW_HZ = 31;
const HIGH_HZ = 16_000;

/**
 * The gain that reaches the top or bottom edge of a thumbnail.
 *
 * Eight decibels rather than the device's own range: the built-ins stay within
 * ±6dB, and a thumbnail scaled to the usual ±15 draws every one of them as a
 * line with a wobble in it. ±12 was tried first and still looked flat on a
 * 20-point tile; at ±8 a bass shelf reads as a bass shelf, and a user's curve
 * that goes further simply touches the edge.
 */
export const SHAPE_RANGE_DB = 8;

/**
 * A preset's curve as a row of heights between -1 and 1, for drawing.
 *
 * Sampled at log-spaced frequencies with the same interpolation the bands are
 * set with (`gainAt`), so the little picture on a preset is the shape the
 * equaliser will actually take rather than an illustration of it. Values past
 * the range are held at the edge rather than drawn off the tile.
 */
export function curveShape(points: readonly CurvePoint[], samples = 16): number[] {
  const count = Math.max(2, Math.floor(samples));
  const low = Math.log(LOW_HZ);
  const span = Math.log(HIGH_HZ) - low;

  return Array.from({ length: count }, (_, index) => {
    const hz = Math.exp(low + (span * index) / (count - 1));
    const db = gainAt(points, hz);
    return Math.max(-1, Math.min(1, db / SHAPE_RANGE_DB));
  });
}
