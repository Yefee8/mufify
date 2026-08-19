import { createMMKV } from 'react-native-mmkv';

/**
 * The only module allowed to import react-native-mmkv.
 *
 * Settings live here because reads are synchronous — the theme and language
 * are known before the first frame, so the app never flashes the wrong one.
 * Anything that must survive a restart *as data* belongs in SQLite instead.
 */
export const settingsStorage = createMMKV({ id: 'mufify.settings' });

export const SETTINGS_KEYS = {
  theme: 'settings.theme',
  language: 'settings.language',
  weekStart: 'settings.weekStart',
  shuffleAlgorithm: 'settings.shuffleAlgorithm',
  librarySort: 'settings.librarySort',
  haptics: 'settings.haptics',
  resumeOnLaunch: 'settings.resumeOnLaunch',
  ignoreShortFiles: 'settings.ignoreShortFiles',
  statsEnabled: 'settings.statsEnabled',
  animationSpeed: 'settings.animationSpeed',
  equalizerEnabled: 'settings.equalizerEnabled',
  equalizerPreset: 'settings.equalizerPreset',
  /** Custom band gains in millibels, by band index. Device-shaped, so JSON. */
  equalizerLevels: 'settings.equalizerLevels',
  /** Presets the user saved, as curves. JSON; see services/equalizer. */
  equalizerSavedPresets: 'settings.equalizerSavedPresets',
  /** Milliseconds of ramp at a track boundary. 0 is off. */
  trackFade: 'settings.trackFade',
  /** The queue and position, so playback can resume where it stopped. */
  lastSession: 'settings.lastSession',
  /**
   * Whether the audio permission dialog has ever been shown.
   *
   * Persisted so a first launch does not accuse anyone of refusing something
   * they were never asked. Before the question has been put, "not granted"
   * means "not yet asked", and the two need different words on screen.
   */
  audioPermissionAsked: 'settings.audioPermissionAsked',
} as const;
