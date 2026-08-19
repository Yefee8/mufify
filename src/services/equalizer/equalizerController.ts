import {
  attachEqualizer,
  setEqualizerBandLevels,
  setEqualizerEnabled as setNativeEnabled,
  type EqualizerCapabilities,
} from 'audio-eq';

import {
  getEqualizerEnabled,
  getEqualizerLevels,
  getEqualizerPreset,
  setEqualizerLevels,
} from '@/services/settings';

import { curveForBands, fitLevels } from './curve';
import { presetCurve, type CurvePoint, type EqualizerPresetId } from './presets';

/**
 * The one place that decides what the equaliser is doing.
 *
 * Three things have to agree and none of them can drive on its own: the
 * stored settings, the bands this device turns out to have, and the audio
 * session, which only exists once something has played and is replaced
 * whenever the player is. So the controller holds the last known capabilities
 * and re-applies everything each time a session arrives.
 *
 * Everything here is millibels, because that is what the platform takes. The
 * screen works in decibels and converts at its own edge.
 */

let capabilities: EqualizerCapabilities | null = null;
const listeners = new Set<(capabilities: EqualizerCapabilities | null) => void>();

function emit(): void {
  for (const listener of listeners) listener(capabilities);
}

export function subscribeCapabilities(
  listener: (capabilities: EqualizerCapabilities | null) => void,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getCapabilities(): EqualizerCapabilities | null {
  return capabilities;
}

/**
 * The levels a preset asks for on this device, in millibels.
 *
 * `custom` is the stored array fitted to the band count rather than a curve —
 * it is the one selection held per band, so it is also the one that has to
 * cope with the count changing underneath it.
 */
export function levelsFor(
  preset: EqualizerPresetId,
  device: EqualizerCapabilities,
): number[] {
  if (preset === 'custom') {
    return fitLevels(getEqualizerLevels(), device.bands.length, device);
  }
  const curve = presetCurve(preset) ?? [];
  return curveForBands(
    curve,
    device.bands.map((band) => band.centerHz),
    device,
  );
}

/**
 * Bind to a session and put the stored settings back on it.
 *
 * Safe to call for every track: attaching to a session that is already
 * attached does nothing. Called for every track *because* a session is
 * replaced when the player is rebuilt, and an effect bound to the old one is
 * simply not in the signal path any more.
 */
export async function attachToSession(audioSessionId: number): Promise<void> {
  const device = await attachEqualizer(audioSessionId);
  if (device === null) return;

  capabilities = device;
  await applyStoredSettings();
  emit();
}

/** Push whatever the settings currently say at the effect. */
export async function applyStoredSettings(): Promise<void> {
  const device = capabilities;
  if (device === null) return;

  await setNativeEnabled(getEqualizerEnabled());
  await setEqualizerBandLevels(levelsFor(getEqualizerPreset(), device));
}

/** Turn it on or off, and make the change audible now. */
export async function applyEnabled(enabled: boolean): Promise<void> {
  await setNativeEnabled(enabled);
}

/** Switch preset, and make the change audible now. */
export async function applyPreset(preset: EqualizerPresetId): Promise<void> {
  const device = capabilities;
  if (device === null) return;
  await setEqualizerBandLevels(levelsFor(preset, device));
}

/**
 * Move one band by hand.
 *
 * Writes the whole custom array rather than the one band, because that is what
 * the store holds and what the next attach will replay. The caller is
 * responsible for having switched the preset to `custom` — the levels and the
 * name of the thing selected have to change together or the screen shows a
 * preset whose curve is not what is playing.
 */
export async function applyCustomLevels(millibels: readonly number[]): Promise<void> {
  setEqualizerLevels(millibels);
  await setEqualizerBandLevels(millibels);
}

/**
 * Load a saved preset's curve onto this device's bands.
 *
 * Sampled rather than copied, which is the whole reason a saved preset is a
 * curve: the bands it was drawn on are not necessarily the bands it is being
 * applied to. Ten where `DynamicsProcessing` exists, five below API 28, and a
 * preset that travelled here from another phone knows nothing about either.
 *
 * It lands as the custom levels, and the caller switches the selection to
 * `custom` alongside — the levels and the name of the thing selected have to
 * change together, or the screen shows a preset whose curve is not what is
 * playing.
 */
export async function applySavedCurve(points: readonly CurvePoint[]): Promise<number[]> {
  const device = capabilities;
  if (device === null) return [];

  const levels = curveForBands(
    points,
    device.bands.map((band) => band.centerHz),
    device,
  );
  await applyCustomLevels(levels);
  return levels;
}

/** The curve the bands are currently drawn at, for saving or sharing. */
export function currentCurve(levelsMb: readonly number[]): CurvePoint[] {
  const device = capabilities;
  if (device === null) return [];
  return device.bands.map((band, index) => ({
    hz: band.centerHz,
    db: (levelsMb[index] ?? 0) / 100,
  }));
}
