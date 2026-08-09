import type { EqualizerCapabilities } from 'audio-eq';
import { hasEqualizer } from 'audio-eq';
import { SlidersHorizontal } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { OptionList, type Option } from '@/components/ui/OptionList';
import { SettingRow } from '@/components/ui/SettingRow';
import { SettingSwitch } from '@/components/ui/SettingSwitch';
import {
  applyCustomLevels,
  applyEnabled,
  applyPreset,
  getCapabilities,
  levelsFor,
  subscribeCapabilities,
} from '@/services/equalizer/equalizerController';
import { EQUALIZER_PRESET_IDS, type EqualizerPresetId } from '@/services/equalizer/presets';
import {
  getEqualizerEnabled,
  getEqualizerPreset,
  setEqualizerEnabled,
  setEqualizerPreset,
} from '@/services/settings';
import { SPACING } from '@/theme/tokens';

import { BandSlider } from './BandSlider';

/**
 * The equaliser, as far as the user is concerned.
 *
 * Three states, and the empty one matters: until something has played there is
 * no audio session to attach an effect to, so there are no bands to show and
 * saying so is better than rendering a dead row of sliders. The switch and the
 * preset are still stored, and are applied the moment a session appears.
 */
export function EqualizerSettings() {
  const { t } = useTranslation();

  const [capabilities, setCapabilities] = useState<EqualizerCapabilities | null>(getCapabilities);
  const [enabled, setEnabledState] = useState(getEqualizerEnabled);
  const [preset, setPresetState] = useState<EqualizerPresetId>(getEqualizerPreset);

  /**
   * The levels a finger is putting there, and which selection they belong to.
   *
   * Held rather than derived only because a drag has to redraw: what the
   * sliders show is otherwise a function of the preset and the device's bands,
   * and mirroring that into state would need an effect to keep the copy honest
   * every time either changed. Carrying the selection alongside means a stale
   * drag is recognised as stale rather than shown against a different preset.
   */
  const [dragged, setDragged] = useState<{ preset: EqualizerPresetId; levels: number[] } | null>(
    null,
  );

  useEffect(() => subscribeCapabilities(setCapabilities), []);

  const bandCount = capabilities?.bands.length ?? 0;
  const levels = useMemo(
    () =>
      dragged !== null && dragged.preset === preset && dragged.levels.length === bandCount
        ? dragged.levels
        : capabilities === null
          ? []
          : levelsFor(preset, capabilities),
    [bandCount, capabilities, dragged, preset],
  );

  const onEnabledChange = useCallback((next: boolean) => {
    setEnabledState(next);
    setEqualizerEnabled(next);
    void applyEnabled(next);
  }, []);

  const onPresetChange = useCallback((next: EqualizerPresetId) => {
    setPresetState(next);
    setEqualizerPreset(next);
    void applyPreset(next);
  }, []);

  /**
   * Moving a band makes the selection custom, by definition.
   *
   * The name and the curve have to change together: leaving "Rock" selected
   * while the bands say something else would show a preset that is not what is
   * playing.
   */
  const onBandChange = useCallback(
    (index: number, levelMb: number) => {
      const next = [...levels];
      next[index] = levelMb;

      // Tagged `custom` because that is what the selection becomes below, so
      // the next render recognises these levels as current rather than stale.
      setDragged({ preset: 'custom', levels: next });
      void applyCustomLevels(next);

      if (preset !== 'custom') {
        setPresetState('custom');
        setEqualizerPreset('custom');
      }
    },
    [levels, preset],
  );

  const presetOptions: Option<EqualizerPresetId>[] = EQUALIZER_PRESET_IDS.map((value) => ({
    value,
    label: t(`settings.equalizer.presets.${value}`),
    description: t(`settings.equalizer.presetHints.${value}`),
  }));

  if (!hasEqualizer) {
    return <Text className="font-body text-sm text-muted">{t('settings.equalizer.missing')}</Text>;
  }

  return (
    <View style={{ gap: SPACING[4] }}>
      <SettingSwitch
        icon={SlidersHorizontal}
        label={t('settings.equalizer.enable')}
        description={t('settings.equalizer.enableHint')}
        value={enabled}
        onChange={onEnabledChange}
      />

      <SettingRow
        icon={SlidersHorizontal}
        label={t('settings.equalizer.preset')}
        value={t(`settings.equalizer.presets.${preset}`)}
      >
        <OptionList
          options={presetOptions}
          value={preset}
          onChange={onPresetChange}
          accessibilityLabel={t('settings.equalizer.preset')}
        />
      </SettingRow>

      {capabilities === null || capabilities.bands.length === 0 ? (
        <Text className="font-body text-sm text-muted">{t('settings.equalizer.noSession')}</Text>
      ) : (
        <View style={{ gap: SPACING[2] }}>
          {capabilities.bands.map((band, index) => (
            <BandSlider
              key={band.centerHz}
              centerHz={band.centerHz}
              levelMb={levels[index] ?? 0}
              minLevelMb={capabilities.minLevelMb}
              maxLevelMb={capabilities.maxLevelMb}
              onChange={(levelMb) => onBandChange(index, levelMb)}
              disabled={!enabled}
              accessibilityLabel={t('settings.equalizer.band', { hz: band.centerHz })}
            />
          ))}
        </View>
      )}
    </View>
  );
}
