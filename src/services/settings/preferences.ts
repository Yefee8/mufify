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
