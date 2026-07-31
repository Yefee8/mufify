import { getLocales } from 'expo-localization';
// i18next's default export is the singleton instance, and calling `.use()` and
// `.changeLanguage()` on it is the documented API. The import plugin sees the
// same names as top-level exports and warns; that is a false positive here.
/* eslint-disable import/no-named-as-default-member */
import i18n from 'i18next';
import { initReactI18next, useTranslation } from 'react-i18next';

import {
  getLanguagePreference,
  LANGUAGES,
  resolveLanguage,
  setLanguagePreference,
  type Language,
  type LanguagePreference,
} from '@/services/settings';

import en from './locales/en.json';
import tr from './locales/tr.json';

/**
 * Both locale files are typed against the English one, so a key added to one
 * and not the other fails `npm run typecheck` rather than shipping a blank
 * string. `AGENTS.md` requires them to change in the same commit; this is what
 * makes that mechanical instead of a review promise.
 */
export type TranslationKeys = typeof en;

const resources: Record<Language, { translation: TranslationKeys }> = {
  en: { translation: en },
  tr: { translation: tr },
};

/** Device locale tags, most preferred first. */
function deviceLanguageTags(): string[] {
  return getLocales().map((locale) => locale.languageTag);
}

export function initI18n(): typeof i18n {
  const language = resolveLanguage(getLanguagePreference(), deviceLanguageTags());

  void i18n.use(initReactI18next).init({
    resources,
    lng: language,
    fallbackLng: 'en',
    supportedLngs: LANGUAGES,
    // React already escapes everything it renders.
    interpolation: { escapeValue: false },
    returnNull: false,
  });

  return i18n;
}

/** Change language and remember the choice. */
export function changeLanguage(preference: LanguagePreference): void {
  setLanguagePreference(preference);
  void i18n.changeLanguage(resolveLanguage(preference, deviceLanguageTags()));
}

export { i18n };

/**
 * Resolve a key that holds an array of interchangeable strings — the empty
 * state messages. Returns `[]` rather than throwing if the key is wrong, so a
 * bad key degrades to a bare icon instead of a crash.
 */
export function useMessages(key: string): string[] {
  const { t } = useTranslation();
  const value = t(key, { returnObjects: true });
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string');
}
