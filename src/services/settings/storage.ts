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
} as const;
