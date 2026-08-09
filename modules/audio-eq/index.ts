import { requireOptionalNativeModule } from 'expo-modules-core';

/** One band of the device's equaliser. */
export interface EqualizerBand {
  /** Centre frequency in hertz. The device decides these, not the app. */
  centerHz: number;
  /** Current gain in millibels. */
  levelMb: number;
}

/**
 * What this device's equaliser can do.
 *
 * Read rather than assumed: the number of bands, where they sit and how far
 * they move all come from the hardware. Five bands is usual and not
 * guaranteed, and a fixed set of sliders would be wrong on the devices that
 * differ.
 */
export interface EqualizerCapabilities {
  minLevelMb: number;
  maxLevelMb: number;
  bands: EqualizerBand[];
}

interface AudioEqNativeModule {
  attach(audioSessionId: number): Promise<EqualizerCapabilities>;
  getCapabilities(): Promise<EqualizerCapabilities | null>;
  setEnabled(enabled: boolean): Promise<boolean>;
  setBandLevels(millibels: number[]): Promise<boolean>;
  release(): Promise<boolean>;
}

/**
 * Optional, for the same reason `audio-focus` is: a dev client built before
 * this module existed is a normal thing to have on a phone, and importing it
 * eagerly would take down every screen that leads to Settings rather than
 * disabling one row.
 */
const AudioEq = requireOptionalNativeModule<AudioEqNativeModule>('AudioEq');

/** Whether this build can equalise at all. */
export const hasEqualizer = AudioEq !== null;

/**
 * Bind the equaliser to the player's audio session.
 *
 * Returns null when there is nothing to bind to yet — nothing has played, so
 * ExoPlayer has no session — which is a state to wait out rather than an
 * error to show.
 */
export async function attachEqualizer(
  audioSessionId: number,
): Promise<EqualizerCapabilities | null> {
  if (AudioEq === null) return null;
  try {
    return await AudioEq.attach(audioSessionId);
  } catch {
    return null;
  }
}

export async function getEqualizerCapabilities(): Promise<EqualizerCapabilities | null> {
  if (AudioEq === null) return null;
  try {
    return await AudioEq.getCapabilities();
  } catch {
    return null;
  }
}

export async function setEqualizerEnabled(enabled: boolean): Promise<void> {
  await AudioEq?.setEnabled(enabled).catch(() => false);
}

/** Every band at once — a preset is one write, not one per slider. */
export async function setEqualizerBandLevels(millibels: readonly number[]): Promise<void> {
  await AudioEq?.setBandLevels([...millibels]).catch(() => false);
}

export async function releaseEqualizer(): Promise<void> {
  await AudioEq?.release().catch(() => false);
}
