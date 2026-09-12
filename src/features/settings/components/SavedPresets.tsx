import * as Clipboard from 'expo-clipboard';
import { ClipboardPaste, Save } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

import { NameDialog } from '@/components/ui/NameDialog';
import { currentCurve } from '@/services/equalizer/equalizerController';
import { decodePresetCode } from '@/services/equalizer/presetCode';
import { savePreset } from '@/services/equalizer/savedPresetStore';
import { showToast } from '@/services/toast';
import { SPACING } from '@/theme/tokens';
import { useThemeColors } from '@/theme/useTheme';

export interface SavedPresetsProps {
  /** The band gains currently on screen, in millibels. */
  levels: readonly number[];
  /** No session yet, so there is nothing to save. */
  disabled: boolean;
}

/**
 * Two ways to get a preset into the list: make one, or paste one.
 *
 * The list itself moved into `PresetPicker`, which is where choosing happens —
 * this used to own a second horizontal chip row of its own, and two rows of
 * identical-looking chips made the user's presets indistinguishable from the
 * built-ins. These are the actions that *add* to that list, so they stay here,
 * under the faders: saving is something you do after getting a sound right.
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
export function SavedPresets({ levels, disabled }: SavedPresetsProps) {
  const { t } = useTranslation();
  const [naming, setNaming] = useState(false);

  const onSave = useCallback(
    (name: string) => {
      setNaming(false);
      const points = currentCurve(levels);
      if (points.length === 0) return;
      savePreset(name, points);
      showToast(t('settings.equalizer.saved'));
    },
    [levels, t],
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
      savePreset(decoded.name, decoded.points);
      showToast(t('settings.equalizer.import.done', { name: decoded.name }));
    })();
  }, [t]);

  return (
    <View className="flex-row gap-2" style={{ gap: SPACING[2] }}>
      <Action
        label={t('settings.equalizer.save')}
        icon={Save}
        onPress={() => setNaming(true)}
        disabled={disabled}
      />
      {/* Import stays live with no session: a preset can be kept for later even
          when there is nothing playing to hear it on. */}
      <Action
        label={t('settings.equalizer.import.action')}
        icon={ClipboardPaste}
        onPress={onImport}
      />

      <NameDialog
        visible={naming}
        title={t('settings.equalizer.save')}
        onCancel={() => setNaming(false)}
        onSubmit={onSave}
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
