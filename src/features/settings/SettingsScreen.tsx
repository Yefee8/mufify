import { Languages, Monitor, Moon, Shuffle, Sun, type LucideIcon } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text } from 'react-native';

import { Screen } from '@/components/ui/Screen';
import { SegmentedControl, type SegmentedControlOption } from '@/components/ui/SegmentedControl';
import { SettingGroup } from '@/components/ui/SettingGroup';
import { SettingRow } from '@/components/ui/SettingRow';
import { changeLanguage } from '@/i18n';
import {
  getLanguagePreference,
  getShuffleAlgorithm,
  LANGUAGE_PREFERENCES,
  setShuffleAlgorithm,
  THEME_PREFERENCES,
  type LanguagePreference,
  type ThemePreference,
} from '@/services/settings';
import { SHUFFLE_ALGORITHMS, type ShuffleAlgorithm } from '@/services/shuffle';
import { useTheme } from '@/theme/useTheme';

import { ScanFolderList } from './components/ScanFolderList';

const THEME_ICONS: Record<ThemePreference, LucideIcon> = {
  system: Monitor,
  light: Sun,
  dark: Moon,
};

export function SettingsScreen() {
  const { t } = useTranslation();
  const { preference: theme, setPreference: setTheme } = useTheme();
  const [language, setLanguage] = useState<LanguagePreference>(getLanguagePreference);
  const [shuffle, setShuffle] = useState<ShuffleAlgorithm>(getShuffleAlgorithm);

  const themeOptions: SegmentedControlOption<ThemePreference>[] = THEME_PREFERENCES.map(
    (value) => ({
      value,
      label: t(`settings.appearance.${value}`),
      icon: THEME_ICONS[value],
    }),
  );

  const languageOptions: SegmentedControlOption<LanguagePreference>[] = LANGUAGE_PREFERENCES.map(
    (value) => ({ value, label: t(`settings.language.${value}`) }),
  );

  const shuffleOptions: SegmentedControlOption<ShuffleAlgorithm>[] = SHUFFLE_ALGORITHMS.map(
    (value) => ({ value, label: t(`settings.shuffle.${value}`) }),
  );

  function onShuffleChange(next: ShuffleAlgorithm) {
    setShuffle(next);
    setShuffleAlgorithm(next);
  }

  function onLanguageChange(next: LanguagePreference) {
    setLanguage(next);
    changeLanguage(next);
  }

  return (
    <Screen title={t('settings.title')}>
      <ScrollView contentContainerClassName="gap-8 px-6 pb-16">
        <SettingGroup title={t('settings.appearance.title')}>
          <SettingRow
            icon={THEME_ICONS[theme]}
            label={t('settings.appearance.theme')}
            value={t(`settings.appearance.${theme}`)}
          >
            <SegmentedControl
              options={themeOptions}
              value={theme}
              onChange={setTheme}
              accessibilityLabel={t('settings.appearance.theme')}
            />
          </SettingRow>
        </SettingGroup>

        <SettingGroup title={t('settings.language.title')}>
          <SettingRow
            icon={Languages}
            label={t('settings.language.label')}
            value={t(`settings.language.${language}`)}
          >
            <SegmentedControl
              options={languageOptions}
              value={language}
              onChange={onLanguageChange}
              accessibilityLabel={t('settings.language.label')}
            />
          </SettingRow>
        </SettingGroup>

        <SettingGroup title={t('settings.shuffle.title')}>
          <SettingRow
            icon={Shuffle}
            label={t('settings.shuffle.label')}
            value={t(`settings.shuffle.${shuffle}`)}
          >
            <SegmentedControl
              options={shuffleOptions}
              value={shuffle}
              onChange={onShuffleChange}
              accessibilityLabel={t('settings.shuffle.label')}
            />
          </SettingRow>
          {/* Says what each one does — the names alone do not, and the whole
              point of offering three is that the user can tell them apart. */}
          <Text className="font-body text-sm text-muted">
            {t(`settings.shuffle.${shuffle}Hint`)}
          </Text>
        </SettingGroup>

        <SettingGroup title={t('settings.folders.title')}>
          <ScanFolderList />
        </SettingGroup>
      </ScrollView>
    </Screen>
  );
}
