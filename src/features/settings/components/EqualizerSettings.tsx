import type { EqualizerCapabilities } from 'audio-eq';
import { hasEqualizer } from 'audio-eq';
import { SlidersHorizontal } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, Switch, Text, View } from 'react-native';

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
import { useThemeColors } from '@/theme/useTheme';

import { BandSlider } from './BandSlider';

/**
 * The equaliser, as far as the user is concerned.
 *
 * Laid out so that **picking a preset and seeing what it did are one glance**.
 * The first version stacked eight described options above five horizontal
 * sliders, which put the bands off the bottom of the screen: you chose a curve
 * and then scrolled to find out what it was. Presets are a row of chips now,
 * the selected one explains itself in a single line underneath, and the faders
 * sit directly below in the space that buys.
 *
 * Three states, and the empty one matters: until something has played there is
 * no audio session to attach an effect to, so there are no bands to show and
 * saying so is better than rendering a dead row of faders. The switch and the
 * preset are still stored, and are applied the moment a session appears.
 */
export function EqualizerSettings() {
  const { t } = useTranslation();
  const colors = useThemeColors();

  const [capabilities, setCapabilities] = useState<EqualizerCapabilities | null>(getCapabilities);
  const [enabled, setEnabledState] = useState(getEqualizerEnabled);
  const [preset, setPresetState] = useState<EqualizerPresetId>(getEqualizerPreset);

  /**
   * The levels a finger is putting there, and which selection they belong to.
   *
   * Held rather than derived only because a drag has to redraw: what the faders
   * show is otherwise a function of the preset and the device's bands, and
   * mirroring that into state would need an effect to keep the copy honest
   * every time either changed. Carrying the selection alongside means a stale
   * drag is recognised as stale rather than shown against a different preset.
   */
  const [dragged, setDragged] = useState<{ preset: EqualizerPresetId; levels: number[] } | null>(
    null,
  );

  useEffect(() => subscribeCapabilities(setCapabilities), []);

  /*
   * Keep the selected chip on screen.
   *
   * Dragging a band selects Custom, which is the last chip in the row and was
   * off the right-hand edge — so moving a fader appeared to deselect everything
   * rather than to switch to Custom. Offsets come from layout because the chips
   * are translated and their widths are not knowable here.
   */
  const chipRow = useRef<ScrollView>(null);
  const chipOffsets = useRef<Record<string, number>>({});

  useEffect(() => {
    const x = chipOffsets.current[preset];
    if (x === undefined) return;
    chipRow.current?.scrollTo({ x: Math.max(0, x - SPACING[6]), animated: true });
  }, [preset]);

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

  const setEnabled = useCallback((next: boolean) => {
    setEnabledState(next);
    setEqualizerEnabled(next);
    void applyEnabled(next);
  }, []);

  /**
   * Touching the equaliser turns it on.
   *
   * Faders that are visible, draggable and inaudible are the worst of the three
   * options — the first report of this screen was that Custom "could not be
   * changed", from someone who had moved the bands with the switch off and
   * heard nothing. Reaching for a control is the intent; the switch stays for
   * comparing with and without.
   */
  const ensureEnabled = useCallback(() => {
    if (!enabled) setEnabled(true);
  }, [enabled, setEnabled]);

  const onPresetChange = useCallback(
    (next: EqualizerPresetId) => {
      setPresetState(next);
      setEqualizerPreset(next);
      void applyPreset(next);
      ensureEnabled();
    },
    [ensureEnabled],
  );

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
      ensureEnabled();
    },
    [ensureEnabled, levels, preset],
  );

  if (!hasEqualizer) {
    return <Text className="font-body text-sm text-muted">{t('settings.equalizer.missing')}</Text>;
  }

  return (
    <View style={{ gap: SPACING[3] }}>
      <View className="flex-row items-center gap-3">
        <SlidersHorizontal color={colors.legend} size={20} strokeWidth={2} />
        <Text className="flex-1 font-body-medium text-base text-primary">
          {t('settings.equalizer.enable')}
        </Text>
        <Switch
          value={enabled}
          onValueChange={setEnabled}
          accessibilityLabel={t('settings.equalizer.enable')}
          trackColor={{ false: colors.etch, true: colors.signal }}
          thumbColor={colors.label}
        />
      </View>

      {/*
        Chips rather than a list of described rows. The description of the
        *selected* one is directly underneath, which is the only one worth the
        vertical space — the rest are readable by trying them, which is the
        whole point of putting the faders in the same screenful.
      */}
      <ScrollView
        ref={chipRow}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: SPACING[2] }}
      >
        {EQUALIZER_PRESET_IDS.map((id) => {
          const selected = id === preset;
          return (
            <Pressable
              key={id}
              onLayout={(event) => {
                chipOffsets.current[id] = event.nativeEvent.layout.x;
              }}
              onPress={() => onPresetChange(id)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={t(`settings.equalizer.presets.${id}`)}
              className={
                selected
                  ? 'min-h-11 justify-center rounded-full bg-accent px-4'
                  : 'min-h-11 justify-center rounded-full border border-subtle px-4'
              }
            >
              <Text
                className={
                  selected
                    ? 'font-body-medium text-sm text-on-accent'
                    : 'font-body-medium text-sm text-muted'
                }
              >
                {t(`settings.equalizer.presets.${id}`)}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <Text className="font-body text-sm text-muted">
        {t(`settings.equalizer.presetHints.${preset}`)}
      </Text>

      {capabilities === null || capabilities.bands.length === 0 ? (
        <Text className="font-body text-sm text-muted">{t('settings.equalizer.noSession')}</Text>
      ) : (
        <View className="flex-row items-end rounded-sm bg-surface px-1 py-3">
          {capabilities.bands.map((band, index) => (
            <BandSlider
              key={band.centerHz}
              centerHz={band.centerHz}
              levelMb={levels[index] ?? 0}
              minLevelMb={capabilities.minLevelMb}
              maxLevelMb={capabilities.maxLevelMb}
              onChange={(levelMb) => onBandChange(index, levelMb)}
              accessibilityLabel={t('settings.equalizer.band', { hz: band.centerHz })}
            />
          ))}
        </View>
      )}
    </View>
  );
}
