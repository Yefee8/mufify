import { curveShape, SHAPE_RANGE_DB } from './curveShape';
import { presetCurve } from './presets';

describe('curveShape', () => {
  it('draws a flat preset as a flat line through the middle', () => {
    const flat = presetCurve('flat');
    expect(flat).not.toBeNull();
    expect(curveShape(flat ?? []).every((value) => value === 0)).toBe(true);
  });

  it('lifts the left of a bass preset and leaves the right alone', () => {
    const shape = curveShape(presetCurve('bass') ?? []);
    expect(shape[0]).toBeGreaterThan(0);
    expect(shape[shape.length - 1]).toBe(0);
  });

  it('lifts the right of a treble preset more than the left', () => {
    const shape = curveShape(presetCurve('treble') ?? []);
    expect(shape[shape.length - 1] ?? 0).toBeGreaterThan(shape[0] ?? 0);
  });

  it('keeps every value on the tile', () => {
    const loud = [
      { hz: 60, db: SHAPE_RANGE_DB * 3 },
      { hz: 16_000, db: -SHAPE_RANGE_DB * 3 },
    ];
    const shape = curveShape(loud);
    expect(Math.max(...shape)).toBe(1);
    expect(Math.min(...shape)).toBe(-1);
  });

  it('returns the number of samples asked for, and at least two', () => {
    expect(curveShape([], 10)).toHaveLength(10);
    expect(curveShape([], 1)).toHaveLength(2);
  });

  it('draws nothing at all as flat rather than failing', () => {
    expect(curveShape([]).every((value) => value === 0)).toBe(true);
  });
});
