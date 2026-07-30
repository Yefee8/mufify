/**
 * Language logic, deliberately free of any storage or native import so it can
 * be unit tested without a device. `preferences.ts` adds the persistence.
 */

/** Languages the app actually ships. Both are first-class. */
export const LANGUAGES = ['en', 'tr'] as const;
export type Language = (typeof LANGUAGES)[number];

export const LANGUAGE_PREFERENCES = ['system', ...LANGUAGES] as const;
export type LanguagePreference = (typeof LANGUAGE_PREFERENCES)[number];

/**
 * Narrow a list of device locale tags (`tr-TR`, `en-GB`) to a language we
 * ship, honouring an explicit preference first.
 */
export function resolveLanguage(
  preference: LanguagePreference,
  deviceLanguageTags: readonly string[],
): Language {
  if (preference !== 'system') return preference;

  for (const tag of deviceLanguageTags) {
    const base = tag.split('-')[0]?.toLowerCase();
    const match = LANGUAGES.find((language) => language === base);
    if (match) return match;
  }

  return 'en';
}
