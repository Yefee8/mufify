/**
 * Equaliser presets, as curves rather than as slider positions.
 *
 * A preset cannot be "these five numbers". The number of bands and where they
 * sit is the device's decision — five is usual, but a phone with three or with
 * ten is a phone this app has to work on — so a fixed list of gains would land
 * on the wrong frequencies as soon as the hardware differed.
 *
 * So a preset is a shape: a gain in decibels at named frequencies, sampled
 * onto whatever bands the device reports. See `curve.ts`.
 */

/** One point of a preset's curve. */
export interface CurvePoint {
  hz: number;
  db: number;
}

export interface EqualizerPreset {
  id: EqualizerPresetId;
  /** Sorted by frequency, ascending. `curveForBands` relies on it. */
  points: readonly CurvePoint[];
}

export const EQUALIZER_PRESET_IDS = [
  'flat',
  'bass',
  'treble',
  'vocal',
  'rock',
  'electronic',
  'acoustic',
  'custom',
] as const;

export type EqualizerPresetId = (typeof EQUALIZER_PRESET_IDS)[number];

export const DEFAULT_PRESET: EqualizerPresetId = 'flat';

/*
 * Deliberately gentle. ±6dB is already a large change to a mastered track, and
 * a preset that clips the output on the first bass note is a preset people
 * turn off rather than one they adjust. The shapes are conventional: a bass
 * shelf, a treble shelf, a presence lift for voices, the two-ended smile for
 * rock, a scooped mid for electronic, and a small lift at both ends for
 * acoustic material.
 */
const CURVES: Record<Exclude<EqualizerPresetId, 'custom'>, readonly CurvePoint[]> = {
  flat: [
    { hz: 60, db: 0 },
    { hz: 16_000, db: 0 },
  ],
  bass: [
    { hz: 60, db: 6 },
    { hz: 150, db: 4 },
    { hz: 400, db: 1 },
    { hz: 1000, db: 0 },
    { hz: 16_000, db: 0 },
  ],
  treble: [
    { hz: 60, db: 0 },
    { hz: 1000, db: 0 },
    { hz: 4000, db: 3 },
    { hz: 10_000, db: 5 },
    { hz: 16_000, db: 6 },
  ],
  vocal: [
    { hz: 60, db: -2 },
    { hz: 250, db: -1 },
    { hz: 1000, db: 2 },
    { hz: 3000, db: 4 },
    { hz: 8000, db: 1 },
    { hz: 16_000, db: 0 },
  ],
  rock: [
    { hz: 60, db: 4 },
    { hz: 250, db: 1 },
    { hz: 1000, db: -2 },
    { hz: 4000, db: 2 },
    { hz: 12_000, db: 4 },
  ],
  electronic: [
    { hz: 60, db: 5 },
    { hz: 200, db: 2 },
    { hz: 1000, db: -2 },
    { hz: 5000, db: 1 },
    { hz: 14_000, db: 4 },
  ],
  acoustic: [
    { hz: 60, db: 2 },
    { hz: 300, db: 0 },
    { hz: 2000, db: 2 },
    { hz: 6000, db: 3 },
    { hz: 16_000, db: 2 },
  ],
};

/**
 * The curve for a preset, or null for `custom`.
 *
 * Custom has no curve by definition — it is whatever the user dragged the
 * bands to, held per band rather than per frequency, so it is the one preset
 * that cannot be resampled onto a different device.
 */
export function presetCurve(id: EqualizerPresetId): readonly CurvePoint[] | null {
  return id === 'custom' ? null : CURVES[id];
}
