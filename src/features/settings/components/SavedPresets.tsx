import * as Clipboard from 'expo-clipboard';
import { ClipboardPaste, Save, Share2, Trash2 } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { ActionSheet, type ActionSheetAction } from '@/components/ui/ActionSheet';
import { NameDialog } from '@/components/ui/NameDialog';
import { applySavedCurve, currentCurve } from '@/services/equalizer/equalizerController';
import { decodePresetCode, encodePresetCode } from '@/services/equalizer/presetCode';
import {
  addSavedPreset,
  removeSavedPreset,
  type SavedPreset,
} from '@/services/equalizer/savedPresets';
import { getSavedEqualizerPresets, setSavedEqualizerPresets } from '@/services/settings';
import { showToast } from '@/services/toast';
import { SPACING } from '@/theme/tokens';
import { useThemeColors } from '@/theme/useTheme';

export interface SavedPresetsProps {
  /** The band gains currently on screen, in millibels. */
  levels: readonly number[];
  /** Called after a saved preset is loaded, so the screen can follow it. */
  onLoaded: (levels: number[]) => void;
  /** No session yet, so there is nothing to save and nowhere to apply. */
  disabled: boolean;
}

/**
 * Presets the user made: save one, load one, hand one to somebody else.
 *
 * **Sharing is a line of text you copy, not a share sheet.** This app has no
 * network layer and does not hand files to other apps — the track sheet turns
 * down "share file" for that reason. A preset is a different kind of thing: it
 * is ten numbers this app made up, not the user's music. So it goes to the
 * clipboard, and whether it goes anywhere after that is a decision a person
 * makes in another app. Nothing leaves the device on its own.
 *
 * Importing reads the clipboard rather than offering a text field. Somebody
 * receiving a code has just copied it, and asking them to paste into a box is
 * a step that exists only because the app did not look where the text already
 * was.
 */
export function SavedPresets({ levels, onLoaded, disabled }: SavedPresetsProps) {
  const { t } = useTranslation();

  const [presets, setPresets] = useState<SavedPreset[]>(getSavedEqualizerPresets);
  const [naming, setNaming] = useState(false);
  const [target, setTarget] = useState<SavedPreset | null>(null);

  /** One write, so the stored list and the rendered list cannot disagree. */
  const commit = useCallback((next: SavedPreset[]) => {
    setPresets(next);
    setSavedEqualizerPresets(next);
  }, []);

  const onSave = useCallback(
    (name: string) => {
      setNaming(false);
      const points = currentCurve(levels);
      if (points.length === 0) return;
      commit(addSavedPreset(presets, name, points));
      showToast(t('settings.equalizer.saved'));
    },
    [commit, levels, presets, t],
  );

  const onLoad = useCallback(
    (preset: SavedPreset) => {
      void (async () => {
        const applied = await applySavedCurve(preset.points);
        if (applied.length > 0) onLoaded(applied);
      })();
    },
    [onLoaded],
  );

  const onShare = useCallback(
    (preset: SavedPreset) => {
      setTarget(null);
      void Clipboard.setStringAsync(encodePresetCode(preset.name, preset.points));
      showToast(t('settings.equalizer.copied'));
    },
    [t],
  );

  /**
   * Read a code out of the clipboard.
   *
   * Every refusal says which refusal it was. "That did not work" for a string
   * somebody was sent is useless — they cannot tell a typo from a preset made
   * by a newer version, and the two need different responses.
   */
  const onImport = useCallback(() => {
    void (async () => {
      const decoded = decodePresetCode(await Clipboard.getStringAsync());
      if (!decoded.ok) {
        showToast(t(`settings.equalizer.import.${camel(decoded.reason)}`));
        return;
      }
      commit(addSavedPreset(presets, decoded.name, decoded.points));
      showToast(t('settings.equalizer.import.done', { name: decoded.name }));
    })();
  }, [commit, presets, t]);

  const onSheetAction = useCallback(
    (id: string) => {
      const preset = target;
      if (!preset) return;
      if (id === 'share') {
        onShare(preset);
        return;
      }
      setTarget(null);
      commit(removeSavedPreset(presets, preset.id));
    },
    [commit, onShare, presets, target],
  );

  const sheetActions: ActionSheetAction[] = [
    { id: 'share', label: t('settings.equalizer.share'), icon: Share2, emphasis: true },
    { id: 'delete', label: t('settings.equalizer.forget'), icon: Trash2 },
  ];

  return (
    <View style={{ gap: SPACING[2] }}>
      <View className="flex-row gap-2">
        <Action
          label={t('settings.equalizer.save')}
          icon={Save}
          onPress={() => setNaming(true)}
          disabled={disabled}
        />
        {/* Import stays live with no session: a preset can be kept for later
            even when there is nothing playing to hear it on. */}
        <Action
          label={t('settings.equalizer.import.action')}
          icon={ClipboardPaste}
          onPress={onImport}
        />
      </View>

      {presets.length === 0 ? (
        <Text className="font-body text-sm text-muted">{t('settings.equalizer.noSaved')}</Text>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: SPACING[2] }}
        >
          {presets.map((preset) => (
            <Pressable
              key={preset.id}
              onPress={() => onLoad(preset)}
              onLongPress={() => setTarget(preset)}
              disabled={disabled}
              accessibilityRole="button"
              accessibilityLabel={preset.name}
              accessibilityHint={t('settings.equalizer.savedHint')}
              className="min-h-11 justify-center rounded-full border border-subtle px-4"
            >
              <Text numberOfLines={1} className="font-body-medium text-sm text-primary">
                {preset.name}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      <NameDialog
        visible={naming}
        title={t('settings.equalizer.save')}
        onCancel={() => setNaming(false)}
        onSubmit={onSave}
      />

      <ActionSheet
        visible={target !== null}
        title={target?.name ?? ''}
        actions={sheetActions}
        onSelect={onSheetAction}
        onClose={() => setTarget(null)}
      />
    </View>
  );
}

interface ActionProps {
  label: string;
  icon: typeof Save;
  onPress: () => void;
  disabled?: boolean;
}

function Action({ label, icon: Icon, onPress, disabled = false }: ActionProps) {
  const colors = useThemeColors();

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      className="min-h-11 flex-1 flex-row items-center justify-center gap-2 rounded-sm border border-subtle px-3"
    >
      <Icon color={disabled ? colors.etch : colors.signal} size={16} strokeWidth={2} />
      <Text
        numberOfLines={1}
        className={
          disabled ? 'font-body-medium text-sm text-muted' : 'font-body-medium text-sm text-accent'
        }
      >
        {label}
      </Text>
    </Pressable>
  );
}

/** `not-a-preset` names a translation key as `notAPreset`. */
function camel(reason: string): string {
  return reason.replace(/-(\w)/gu, (_, letter: string) => letter.toUpperCase());
}
