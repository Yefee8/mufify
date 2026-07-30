import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';

import { Screen } from '@/components/ui/Screen';
import { SegmentedControl, type SegmentedControlOption } from '@/components/ui/SegmentedControl';
import { SettingGroup } from '@/components/ui/SettingGroup';
import { changeLanguage } from '@/i18n';
import {
  getLanguagePreference,
  LANGUAGE_PREFERENCES,
  THEME_PREFERENCES,
  type LanguagePreference,
  type ThemePreference,
} from '@/services/settings';
import { useTheme } from '@/theme/useTheme';

export function SettingsScreen() {
  const { t } = useTranslation();
  const { preference: theme, setPreference: setTheme } = useTheme();
  const [language, setLanguage] = useState<LanguagePreference>(getLanguagePreference);

  const themeOptions: SegmentedControlOption<ThemePreference>[] = THEME_PREFERENCES.map(
    (value) => ({ value, label: t(`settings.appearance.${value}`) }),
  );

  const languageOptions: SegmentedControlOption<LanguagePreference>[] = LANGUAGE_PREFERENCES.map(
    (value) => ({
      value,
      label: t(`settings.language.${value}`),
    }),
  );

  function onLanguageChange(next: LanguagePreference) {
    setLanguage(next);
    changeLanguage(next);
  }

  return (
    <Screen title={t('settings.title')}>
      <ScrollView contentContainerClassName="gap-6 px-6 pb-16">
        <SettingGroup title={t('settings.appearance.title')}>
          <View className="gap-3">
            <Text className="font-body text-base text-primary">
              {t('settings.appearance.theme')}
            </Text>
            <SegmentedControl
              options={themeOptions}
              value={theme}
              onChange={setTheme}
              accessibilityLabel={t('settings.appearance.theme')}
            />
          </View>
        </SettingGroup>

        <SettingGroup title={t('settings.language.title')}>
          <View className="gap-3">
            <Text className="font-body text-base text-primary">{t('settings.language.label')}</Text>
            <SegmentedControl
              options={languageOptions}
              value={language}
              onChange={onLanguageChange}
              accessibilityLabel={t('settings.language.label')}
            />
          </View>
        </SettingGroup>
      </ScrollView>
    </Screen>
  );
}
