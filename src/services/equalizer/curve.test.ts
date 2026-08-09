import {
  clampMb,
  curveForBands,
  dbToMb,
  fitLevels,
  formatFrequency,
  formatGain,
  gainAt,
  mbToDb,
} from './curve';
import { EQUALIZER_PRESET_IDS, presetCurve, type EqualizerPresetId } from './presets';

const RANGE = { minLevelMb: -1500, maxLevelMb: 1500 };

describe('reading a curve', () => {
  const points = [
    { hz: 100, db: 6 },
    { hz: 1000, db: 0 },
    { hz: 10_000, db: 6 },
  ];

  it('returns the exact value at a point', () => {
    expect(gainAt(points, 100)).toBe(6);
    expect(gainAt(points, 1000)).toBe(0);
    expect(gainAt(points, 10_000)).toBe(6);
  });

  it('holds the nearest value outside the curve', () => {
    // A device with a 31Hz band must not fall off the bottom of a preset.
    expect(gainAt(points, 31)).toBe(6);
    expect(gainAt(points, 20_000)).toBe(6);
  });

  it('interpolates on a logarithmic axis, not a linear one', () => {
    // 316Hz is the geometric midpoint of 100 and 1000, so it is halfway down
    // the curve. Linear interpolation would put it at about 5.4dB.
    expect(gainAt(points, Math.sqrt(100 * 1000))).toBeCloseTo(3, 5);
    // 550Hz is the *arithmetic* midpoint, which linear interpolation would put
    // at exactly 3dB. On a log axis it is nearly three quarters of the way
    // along, and much lower.
    expect(gainAt(points, 550)).toBeLessThan(2);
  });

  it('is flat for an empty curve', () => {
    expect(gainAt([], 1000)).toBe(0);
  });

  it('survives two points at the same frequency', () => {
    expect(gainAt([{ hz: 500, db: 2 }, { hz: 500, db: -3 }], 500)).toBe(2);
    expect(
      gainAt([{ hz: 100, db: 0 }, { hz: 500, db: 2 }, { hz: 500, db: -3 }], 400),
    ).toBeGreaterThan(0);
  });
});

describe('sampling onto a device', () => {
  it('produces one level per band, in millibels', () => {
    const points = [
      { hz: 60, db: 6 },
      { hz: 16_000, db: 6 },
    ];
    expect(curveForBands(points, [60, 230, 910, 3600, 14_000], RANGE)).toEqual([
      600, 600, 600, 600, 600,
    ]);
  });

  it('clamps to what the device accepts', () => {
    // The preset asks for +6dB; this device stops at ±3dB.
    const narrow = { minLevelMb: -300, maxLevelMb: 300 };
    const points = [
      { hz: 60, db: 6 },
      { hz: 16_000, db: -6 },
    ];
    const levels = curveForBands(points, [60, 16_000], narrow);
    expect(levels).toEqual([300, -300]);
  });

  it('works for a device with a band count nobody expected', () => {
    const points = presetCurve('bass');
    expect(points).not.toBeNull();
    const three = curveForBands(points ?? [], [31, 1000, 16_000], RANGE);
    const ten = curveForBands(
      points ?? [],
      [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16_000],
      RANGE,
    );
    expect(three).toHaveLength(3);
    expect(ten).toHaveLength(10);
  });

  it('is flat everywhere for the flat preset', () => {
    const points = presetCurve('flat') ?? [];
    expect(curveForBands(points, [31, 62, 125, 1000, 8000, 16_000], RANGE)).toEqual([
      0, 0, 0, 0, 0, 0,
    ]);
  });

  it('lifts the low bands and leaves the high ones for bass', () => {
    const points = presetCurve('bass') ?? [];
    const [low, , high] = curveForBands(points, [60, 1000, 14_000], RANGE);
    expect(low).toBeGreaterThan(0);
    expect(high).toBe(0);
  });

  it('lifts the high bands and leaves the low ones for treble', () => {
    const points = presetCurve('treble') ?? [];
    const [low, , high] = curveForBands(points, [60, 1000, 14_000], RANGE);
    expect(low).toBe(0);
    expect(high).toBeGreaterThan(0);
  });
});

describe('every preset', () => {
  const bands = [60, 230, 910, 3600, 14_000];

  it.each(EQUALIZER_PRESET_IDS.filter((id) => id !== 'custom'))(
    'has a curve that fits a five-band device: %s',
    (id) => {
      const points = presetCurve(id as EqualizerPresetId);
      expect(points).not.toBeNull();
      const levels = curveForBands(points ?? [], bands, RANGE);
      expect(levels).toHaveLength(bands.length);
      for (const level of levels) {
        expect(Number.isFinite(level)).toBe(true);
        // Nothing extreme enough to clip on a normally mastered track.
        expect(Math.abs(level)).toBeLessThanOrEqual(600);
      }
    },
  );

  it.each(EQUALIZER_PRESET_IDS.filter((id) => id !== 'custom'))(
    'is sorted by frequency, which the interpolation relies on: %s',
    (id) => {
      const points = presetCurve(id as EqualizerPresetId) ?? [];
      const frequencies = points.map((point) => point.hz);
      expect(frequencies).toEqual([...frequencies].sort((a, b) => a - b));
    },
  );

  it('has no curve for custom, because custom is per band', () => {
    expect(presetCurve('custom')).toBeNull();
  });
});

describe('clamping', () => {
  it('keeps a level inside the range', () => {
    expect(clampMb(9999, RANGE)).toBe(1500);
    expect(clampMb(-9999, RANGE)).toBe(-1500);
    expect(clampMb(250, RANGE)).toBe(250);
  });

  it('copes with a device that reports its range inverted', () => {
    expect(clampMb(9999, { minLevelMb: 1500, maxLevelMb: -1500 })).toBe(1500);
    expect(clampMb(-9999, { minLevelMb: 1500, maxLevelMb: -1500 })).toBe(-1500);
  });

  it('turns a nonsense level into silence rather than passing it on', () => {
    expect(clampMb(Number.NaN, RANGE)).toBe(0);
    expect(clampMb(Number.POSITIVE_INFINITY, RANGE)).toBe(0);
  });
});

describe('units', () => {
  it('round-trips decibels through millibels', () => {
    expect(dbToMb(3)).toBe(300);
    expect(dbToMb(-1.5)).toBe(-150);
    expect(mbToDb(300)).toBe(3);
    expect(mbToDb(-150)).toBe(-1.5);
  });
});

describe('fitting stored custom levels', () => {
  it('pads a device with more bands than were stored', () => {
    expect(fitLevels([300, -200], 4, RANGE)).toEqual([300, -200, 0, 0]);
  });

  it('drops bands a smaller device does not have', () => {
    expect(fitLevels([300, -200, 100, 400], 2, RANGE)).toEqual([300, -200]);
  });

  it('clamps what it kept', () => {
    expect(fitLevels([9999], 1, RANGE)).toEqual([1500]);
  });

  it('is flat for nothing stored', () => {
    expect(fitLevels([], 3, RANGE)).toEqual([0, 0, 0]);
  });
});

describe('reading the numbers back', () => {
  it('writes hertz below a kilohertz', () => {
    expect(formatFrequency(60)).toBe('60 Hz');
    expect(formatFrequency(230)).toBe('230 Hz');
  });

  it('writes kilohertz above one, with a decimal only when it says something', () => {
    expect(formatFrequency(1000)).toBe('1 kHz');
    expect(formatFrequency(1600)).toBe('1.6 kHz');
    expect(formatFrequency(14_000)).toBe('14 kHz');
  });

  it('always signs a gain, so zero is visibly the middle', () => {
    expect(formatGain(0)).toBe('0 dB');
    expect(formatGain(-0)).toBe('0 dB');
    expect(formatGain(3)).toBe('+3 dB');
    expect(formatGain(-1.5)).toBe('−1.5 dB');
  });
});
