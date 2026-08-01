import {
  Clock,
  Languages,
  Monitor,
  Moon,
  Shuffle,
  Sun,
  Vibrate,
  type LucideIcon,
} from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView } from 'react-native';

import { OptionList, type Option } from '@/components/ui/OptionList';
import { Screen } from '@/components/ui/Screen';
import { SegmentedControl, type SegmentedControlOption } from '@/components/ui/SegmentedControl';
import { SettingGroup } from '@/components/ui/SettingGroup';
import { SettingRow } from '@/components/ui/SettingRow';
import { SettingSwitch } from '@/components/ui/SettingSwitch';
import { changeLanguage } from '@/i18n';
import { useLifecycleTrace } from '@/services/perf/useLifecycleTrace';
import {
  getHapticsEnabled,
  getIgnoreShortFiles,
  getLanguagePreference,
  getShuffleAlgorithm,
  LANGUAGE_PREFERENCES,
  setHapticsEnabled,
  setIgnoreShortFiles,
  setShuffleAlgorithm,
  THEME_PREFERENCES,
  type LanguagePreference,
  type ThemePreference,
} from '@/services/settings';
import { SHUFFLE_ALGORITHMS, type ShuffleAlgorithm } from '@/services/shuffle';
import { useTheme } from '@/theme/useTheme';

import { DevTools } from './components/DevTools';
import { ScanFolderList } from './components/ScanFolderList';

const THEME_ICONS: Record<ThemePreference, LucideIcon> = {
  system: Monitor,
  light: Sun,
  dark: Moon,
};

/**
 * Every setting, each one explained.
 *
 * The rule this screen follows: a row names a setting, and a line under it says
 * what the setting does. A list of bare names makes the user guess, and the
 * guesses are wrong exactly where it matters — nobody knows what "Discovery"
 * means from the word.
 *
 * Theme and language stay as segmented controls: three and three short,
 * self-evident options each. Shuffle is a column, because five names that need
 * explaining is a different problem — see `OptionList`.
 */
export function SettingsScreen() {
  useLifecycleTrace('SettingsScreen');
  const { t } = useTranslation();
  const { preference: theme, setPreference: setTheme } = useTheme();

  const [language, setLanguage] = useState<LanguagePreference>(getLanguagePreference);
  const [shuffle, setShuffle] = useState<ShuffleAlgorithm>(getShuffleAlgorithm);
  const [haptics, setHaptics] = useState(getHapticsEnabled);
  const [ignoreShort, setIgnoreShort] = useState(getIgnoreShortFiles);

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

  const shuffleOptions: Option<ShuffleAlgorithm>[] = SHUFFLE_ALGORITHMS.map((value) => ({
    value,
    label: t(`settings.shuffle.${value}`),
    description: t(`settings.shuffle.${value}Hint`),
  }));

  function onShuffleChange(next: ShuffleAlgorithm) {
    setShuffle(next);
    setShuffleAlgorithm(next);
  }

  function onLanguageChange(next: LanguagePreference) {
    setLanguage(next);
    changeLanguage(next);
  }

  function onHapticsChange(next: boolean) {
    setHaptics(next);
    setHapticsEnabled(next);
  }

  function onIgnoreShortChange(next: boolean) {
    setIgnoreShort(next);
    setIgnoreShortFiles(next);
  }

  return (
    <Screen title={t('settings.title')}>
      <ScrollView contentContainerClassName="gap-8 px-6 pb-16">
        <SettingGroup title={t('settings.appearance.title')}>
          <SettingRow
            icon={THEME_ICONS[theme]}
            label={t('settings.appearance.theme')}
            value={t(`settings.appearance.${theme}`)}
            description={t('settings.appearance.description')}
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
            description={t('settings.language.description')}
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
          {/* No `description` on the row: the list explains every option, and
              saying it twice is worse than saying it once. */}
          <SettingRow
            icon={Shuffle}
            label={t('settings.shuffle.label')}
            value={t(`settings.shuffle.${shuffle}`)}
          >
            <OptionList
              options={shuffleOptions}
              value={shuffle}
              onChange={onShuffleChange}
              accessibilityLabel={t('settings.shuffle.label')}
            />
          </SettingRow>
        </SettingGroup>

        {/*
          No "resume on launch" switch yet. The preference exists in the store,
          but nothing persists or restores a queue, so the control would have
          been a switch that changes nothing — worse than an absent feature,
          because it claims one. It goes in when the queue does.
        */}
        <SettingGroup title={t('settings.playback.title')}>
          <SettingSwitch
            icon={Vibrate}
            label={t('settings.playback.haptics')}
            description={t('settings.playback.hapticsHint')}
            value={haptics}
            onChange={onHapticsChange}
          />
        </SettingGroup>

        <SettingGroup title={t('settings.folders.title')}>
          <SettingSwitch
            icon={Clock}
            label={t('settings.folders.ignoreShort')}
            description={t('settings.folders.ignoreShortHint')}
            value={ignoreShort}
            onChange={onIgnoreShortChange}
          />
          <ScanFolderList />
        </SettingGroup>

        {__DEV__ ? (
          <SettingGroup title="Development">
            <DevTools />
          </SettingGroup>
        ) : null}
      </ScrollView>
    </Screen>
  );
}
