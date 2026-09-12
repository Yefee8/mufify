import type { EqualizerCapabilities } from 'audio-eq';
import * as Clipboard from 'expo-clipboard';
import { hasEqualizer } from 'audio-eq';
import { SlidersHorizontal } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Switch, Text, View } from 'react-native';

import {
  applyCustomLevels,
  applyEnabled,
  applyPreset,
  getCapabilities,
  levelsFor,
  subscribeCapabilities,
} from '@/services/equalizer/equalizerController';
import type { EqualizerPresetId } from '@/services/equalizer/presets';
import type { SavedPreset } from '@/services/equalizer/savedPresets';
import {
  forgetPreset,
  setActive,
  useSavedPresets,
} from '@/services/equalizer/savedPresetStore';
import { encodePresetCode } from '@/services/equalizer/presetCode';
import { showToast } from '@/services/toast';
import {
  getEqualizerEnabled,
  getEqualizerPreset,
  setEqualizerEnabled,
  setEqualizerPreset,
} from '@/services/settings';
import { SPACING } from '@/theme/tokens';
import { useThemeColors } from '@/theme/useTheme';

import { BandSlider } from './BandSlider';
import { PresetPicker } from './PresetPicker';
import { SavedPresets } from './SavedPresets';

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

  const { presets: savedPresets, activeId } = useSavedPresets();

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
      // No longer one of the user's, whatever it was before.
      setActive(null);
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
      // A dragged band is nobody's saved preset any more, even if it started as
      // one — the name would otherwise outlive the curve it was given to.
      setActive(null);
      void applyCustomLevels(next);

      if (preset !== 'custom') {
        setPresetState('custom');
        setEqualizerPreset('custom');
      }
      ensureEnabled();
    },
    [ensureEnabled, levels, preset],
  );

  /**
   * Load one of the user's presets.
   *
   * The selection is recorded and the *controller* samples the curve onto
   * whatever bands exist — rather than this screen sampling it and writing
   * levels. That is what lets a saved preset be chosen before anything has
   * played: there are no bands to sample onto yet, a built-in has always been
   * selectable in that state, and one of your own now behaves the same instead
   * of silently doing nothing.
   *
   * `setActive` comes first: `applyPreset('custom')` reads it to decide whether
   * "custom" means a saved curve or the hand-dragged levels.
   */
  const onSelectSaved = useCallback(
    (entry: SavedPreset) => {
      setActive(entry.id);
      setPresetState('custom');
      setEqualizerPreset('custom');
      // Any half-finished drag belongs to the curve being replaced.
      setDragged(null);
      void applyPreset('custom');
      ensureEnabled();
    },
    [ensureEnabled],
  );

  const onShare = useCallback(
    (entry: SavedPreset) => {
      void Clipboard.setStringAsync(encodePresetCode(entry.name, entry.points));
      showToast(t('settings.equalizer.copied'));
    },
    [t],
  );

  const onForget = useCallback((entry: SavedPreset) => {
    // The curve stays where it is: deleting a name does not change a sound.
    forgetPreset(entry.id);
  }, []);

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
        One row that says what is selected, opening a sheet with everything in
        it. The two horizontal chip rows this replaced hid their own contents —
        the selected chip was regularly off-screen — and made the user's own
        presets look like more built-ins.
      */}
      <PresetPicker
        preset={preset}
        saved={savedPresets}
        activeId={activeId}
        onSelectBuiltIn={onPresetChange}
        onSelectSaved={onSelectSaved}
        onShare={onShare}
        onForget={onForget}
      />

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

      {/*
        Below the faders, because saving is something you do *after* getting a
        sound right, and loading one is a shortcut past the faders rather than
        an alternative to the presets above them.
      */}
      <SavedPresets levels={levels} disabled={bandCount === 0} />
    </View>
  );
}
