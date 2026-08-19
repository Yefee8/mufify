import { MAX_PRESET_NAME, sanitiseName } from './presetCode';
import type { CurvePoint } from './presets';

/**
 * Presets the user made, kept as curves like the built-in ones.
 *
 * A curve rather than a list of slider positions, for the reason ADR 019 gives
 * and one more besides. The band count is not fixed: ten where
 * `DynamicsProcessing` is available, whatever the hardware offers below API 28,
 * and a preset saved on one phone should mean the same thing on another. Ten
 * numbers with no frequencies attached would not survive either journey.
 *
 * The list operations are pure so they can be tested without a device, and so
 * the storage module stays the only thing that knows where any of this lives.
 */

export interface SavedPreset {
  /** Stable, so renaming or reordering cannot orphan a selection. */
  id: string;
  name: string;
  points: CurvePoint[];
}

/** Enough for anyone, and a ceiling on what a corrupt read can allocate. */
export const MAX_SAVED_PRESETS = 20;

/**
 * Add one, newest first, replacing any earlier preset of the same name.
 *
 * Replacing rather than accumulating: saving twice while adjusting a sound is
 * what people actually do, and the alternative is three chips called "Gece"
 * where only the last is the one they meant. Names are compared without case
 * or surrounding space, because that is how somebody re-typing a name means it.
 */
export function addSavedPreset(
  presets: readonly SavedPreset[],
  name: string,
  points: readonly CurvePoint[],
): SavedPreset[] {
  const clean = sanitiseName(name);
  if (!clean || points.length === 0) return [...presets];

  const key = clean.toLocaleLowerCase();
  const rest = presets.filter((preset) => preset.name.toLocaleLowerCase() !== key);

  return [{ id: newId(), name: clean, points: [...points] }, ...rest].slice(0, MAX_SAVED_PRESETS);
}

export function removeSavedPreset(presets: readonly SavedPreset[], id: string): SavedPreset[] {
  return presets.filter((preset) => preset.id !== id);
}

/**
 * Read a stored list back, dropping anything that is no longer a preset.
 *
 * A preference written by an older build must never crash a newer one, which
 * is the rule the rest of `settings` follows. Here it means every field is
 * checked rather than trusted: this list is the one the import feature writes
 * into, so its contents have at some point come from outside the app.
 */
export function parseSavedPresets(raw: unknown): SavedPreset[] {
  if (!Array.isArray(raw)) return [];

  const presets: SavedPreset[] = [];
  for (const entry of raw.slice(0, MAX_SAVED_PRESETS)) {
    const preset = parseOne(entry);
    if (preset !== null) presets.push(preset);
  }
  return presets;
}

function parseOne(entry: unknown): SavedPreset | null {
  if (typeof entry !== 'object' || entry === null) return null;
  const record = entry as Record<string, unknown>;

  const id = typeof record.id === 'string' ? record.id : null;
  const name = typeof record.name === 'string' ? sanitiseName(record.name) : '';
  if (id === null || !name || !Array.isArray(record.points)) return null;

  const points: CurvePoint[] = [];
  for (const point of record.points) {
    if (typeof point !== 'object' || point === null) continue;
    const { hz, db } = point as Record<string, unknown>;
    if (typeof hz !== 'number' || !Number.isFinite(hz)) continue;
    if (typeof db !== 'number' || !Number.isFinite(db)) continue;
    points.push({ hz, db });
  }

  if (points.length === 0) return null;
  return { id, name: name.slice(0, MAX_PRESET_NAME), points };
}

/**
 * A local id, from the clock and a little randomness.
 *
 * These never leave the device and never meet another device's — an imported
 * preset is given a fresh one — so a counter would do. The random suffix is
 * only so that two saves inside one millisecond stay distinct.
 */
function newId(): string {
  return `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
}
