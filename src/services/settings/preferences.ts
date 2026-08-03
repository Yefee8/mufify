import { ANIMATION_SPEEDS, type AnimationSpeed } from '@/services/motion';
import { DEFAULT_SHUFFLE, SHUFFLE_ALGORITHMS, type ShuffleAlgorithm } from '@/services/shuffle';
import { WEEK_STARTS, type WeekStart } from '@/services/stats/periodKeys';

import { LANGUAGE_PREFERENCES, type LanguagePreference } from './language';
import { SETTINGS_KEYS, settingsStorage } from './storage';

/** Theme follows the OS unless the user has picked a side. */
export const THEME_PREFERENCES = ['system', 'light', 'dark'] as const;
export type ThemePreference = (typeof THEME_PREFERENCES)[number];

/**
 * Read a stored value, falling back when it is missing or no longer valid.
 * A preference written by an older build must never crash a newer one.
 */
function readStoredValue<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  const stored = settingsStorage.getString(key);
  return allowed.includes(stored as T) ? (stored as T) : fallback;
}

export function getThemePreference(): ThemePreference {
  return readStoredValue(SETTINGS_KEYS.theme, THEME_PREFERENCES, 'system');
}

export function setThemePreference(preference: ThemePreference): void {
  settingsStorage.set(SETTINGS_KEYS.theme, preference);
}

export function getLanguagePreference(): LanguagePreference {
  return readStoredValue(SETTINGS_KEYS.language, LANGUAGE_PREFERENCES, 'system');
}

export function setLanguagePreference(preference: LanguagePreference): void {
  settingsStorage.set(SETTINGS_KEYS.language, preference);
}

/**
 * Which day a statistics week begins on.
 *
 * Stored now, though nothing sets it yet: every play event writes a week key
 * derived from this at record time, so it has to have a stable answer before
 * the first listen is recorded rather than when the stats screens arrive in
 * Phase 7. Changing it later re-keys only events written after the change,
 * which is a Phase 7 problem to state plainly rather than to solve here.
 *
 * Monday is the ISO default and matches the primary locale.
 */
export function getWeekStart(): WeekStart {
  return readStoredValue(SETTINGS_KEYS.weekStart, WEEK_STARTS, 'monday');
}

export function setWeekStart(weekStart: WeekStart): void {
  settingsStorage.set(SETTINGS_KEYS.weekStart, weekStart);
}

/**
 * Which shuffle algorithm the shuffle button uses.
 *
 * The brief asks for several algorithms selectable in Settings rather than one
 * shuffle behind a toggle, so this is a choice and not a boolean. Balanced is
 * the default because it answers the complaint people actually have about
 * shuffle — that it clusters.
 */
export function getShuffleAlgorithm(): ShuffleAlgorithm {
  return readStoredValue(SETTINGS_KEYS.shuffleAlgorithm, SHUFFLE_ALGORITHMS, DEFAULT_SHUFFLE);
}

export function setShuffleAlgorithm(algorithm: ShuffleAlgorithm): void {
  settingsStorage.set(SETTINGS_KEYS.shuffleAlgorithm, algorithm);
}

/**
 * A stored switch, defaulting to `fallback` when it has never been set.
 *
 * `getBoolean` cannot distinguish "off" from "absent", so an unset switch that
 * should default on would read as off. The explicit `contains` check is what
 * makes "on unless turned off" expressible.
 */
function readStoredFlag(key: string, fallback: boolean): boolean {
  return settingsStorage.contains(key) ? (settingsStorage.getBoolean(key) ?? fallback) : fallback;
}

/** Physical feedback on transport and reorder. On unless turned off. */
export function getHapticsEnabled(): boolean {
  return readStoredFlag(SETTINGS_KEYS.haptics, true);
}

export function setHapticsEnabled(enabled: boolean): void {
  settingsStorage.set(SETTINGS_KEYS.haptics, enabled);
}

/**
 * Restore the queue on a cold start.
 *
 * On by default: this app's audience keeps long albums, and losing your place
 * because Android killed the process is the complaint. It restores paused,
 * never playing — an app that starts making noise on launch is a worse bug than
 * the one this fixes.
 */
export function getResumeOnLaunch(): boolean {
  return readStoredFlag(SETTINGS_KEYS.resumeOnLaunch, true);
}

export function setResumeOnLaunch(enabled: boolean): void {
  settingsStorage.set(SETTINGS_KEYS.resumeOnLaunch, enabled);
}

/**
 * Skip files under 30 seconds when scanning.
 *
 * Off by default. Interludes, field recordings and album segues are legitimate
 * tracks, and silently dropping a fifth of a classical library is worse than
 * showing a few ringtones.
 */
export function getIgnoreShortFiles(): boolean {
  return readStoredFlag(SETTINGS_KEYS.ignoreShortFiles, false);
}

export function setIgnoreShortFiles(enabled: boolean): void {
  settingsStorage.set(SETTINGS_KEYS.ignoreShortFiles, enabled);
}

/**
 * Record listening history at all.
 *
 * On by default — the statistics are the reason half this app exists. Turning
 * it off stops **new** events being written and leaves everything already
 * recorded exactly where it is: this is a tap in Settings, not a destructive
 * action, and a switch that silently deleted a year of history would be a
 * different feature wearing this one's label. Clearing history stays its own
 * deliberate, separately-worded action.
 *
 * Read through `shouldRecordListens` in `services/stats/recordingGate`, which
 * is the only place playback consults it — see that file for why the check
 * lives there rather than inside the recorder.
 */
export function getStatsEnabled(): boolean {
  return readStoredFlag(SETTINGS_KEYS.statsEnabled, true);
}

export function setStatsEnabled(enabled: boolean): void {
  settingsStorage.set(SETTINGS_KEYS.statsEnabled, enabled);
}

/**
 * How long the sheet transitions take.
 *
 * Fixed steps, not a slider: every other scale in this project is a small set
 * of named values, and "somewhere around 0.63" is not a design decision anyone
 * can review. `instant` skips the animation outright rather than running a very
 * stiff spring, which is also what Android's own "remove animations" setting
 * asks for — see `useReducedMotion`, which forces this same path.
 */
export function getAnimationSpeed(): AnimationSpeed {
  return readStoredValue(SETTINGS_KEYS.animationSpeed, ANIMATION_SPEEDS, 'normal');
}

export function setAnimationSpeed(speed: AnimationSpeed): void {
  settingsStorage.set(SETTINGS_KEYS.animationSpeed, speed);
}
