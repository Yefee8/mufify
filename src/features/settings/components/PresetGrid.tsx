import { Share2, Trash2 } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { ActionSheet, type ActionSheetAction } from '@/components/ui/ActionSheet';
import {
  EQUALIZER_PRESET_IDS,
  presetCurve,
  type CurvePoint,
  type EqualizerPresetId,
} from '@/services/equalizer/presets';
import type { SavedPreset } from '@/services/equalizer/savedPresets';

import { PresetTile } from './PresetTile';

export interface PresetGridProps {
  /** The built-in selection. `custom` when a band has been dragged or a saved one is loaded. */
  preset: EqualizerPresetId;
  /** The user's presets, and which of them is loaded. */
  saved: readonly SavedPreset[];
  activeId: string | null;
  /** The hand-dragged curve, for the Custom tile's picture. */
  customCurve: readonly CurvePoint[];
  onSelectBuiltIn: (id: EqualizerPresetId) => void;
  onSelectSaved: (preset: SavedPreset) => void;
  onShare: (preset: SavedPreset) => void;
  onForget: (preset: SavedPreset) => void;
}

/**
 * Every preset on one shelf: the built-ins, Custom, and the user's own.
 *
 * This replaced a row naming the selection and a sheet listing everything in
 * two sections, and the two complaints about it were the two halves of that
 * design. *Which one is on* took opening the sheet to see a tick; and the
 * user's presets lived in a section of their own, behind the same tap, as if
 * they were a different kind of thing. They are not — a preset is a curve,
 * whoever drew it — so they sit in the same grid, marked rather than
 * segregated, and the selection is a filled tile visible without opening
 * anything.
 *
 * A wrapping grid rather than a scrolling row: the version before the sheet
 * was a horizontal chip row, and a row you scroll sideways hides its own
 * selected chip. Nothing here is ever off-screen.
 *
 * The one-line description that used to sit on every row of the sheet sits
 * under the grid now, for the selected tile only — it explains the choice that
 * was made rather than eight that were not. Share and delete stay on long
 * press, as before: the grid is for choosing.
 */
export function PresetGrid({
  preset,
  saved,
  activeId,
  customCurve,
  onSelectBuiltIn,
  onSelectSaved,
  onShare,
  onForget,
}: PresetGridProps) {
  const { t } = useTranslation();
  /** The saved preset whose share/delete sheet is open. */
  const [target, setTarget] = useState<SavedPreset | null>(null);

  const active = saved.find((entry) => entry.id === activeId) ?? null;
  const description = active
    ? t('settings.equalizer.savedHint')
    : t(`settings.equalizer.presetHints.${preset}`);

  const actions = useMemo<ActionSheetAction[]>(
    () => [
      { id: 'share', label: t('settings.equalizer.share'), icon: Share2, emphasis: true },
      { id: 'forget', label: t('settings.equalizer.forget'), icon: Trash2 },
    ],
    [t],
  );

  const onAction = useCallback(
    (id: string) => {
      const entry = target;
      setTarget(null);
      if (entry === null) return;
      if (id === 'share') onShare(entry);
      else onForget(entry);
    },
    [onForget, onShare, target],
  );

  return (
    <View className="gap-2">
      <Text accessibilityRole="header" className="font-body text-sm text-muted">
        {t('settings.equalizer.presetsLabel')}
      </Text>

      <View accessibilityRole="radiogroup" className="-mx-1 flex-row flex-wrap">
        {EQUALIZER_PRESET_IDS.map((id) => (
          <View key={id} className="w-1/3 p-1">
            <PresetTile
              label={t(`settings.equalizer.presets.${id}`)}
              hint={t(`settings.equalizer.presetHints.${id}`)}
              points={presetCurve(id) ?? customCurve}
              selected={active === null && id === preset}
              onPress={() => onSelectBuiltIn(id)}
            />
          </View>
        ))}

        {saved.map((entry) => (
          <View key={entry.id} className="w-1/3 p-1">
            <PresetTile
              label={entry.name}
              hint={t('settings.equalizer.savedHint')}
              points={entry.points}
              selected={entry.id === activeId}
              mine
              onPress={() => onSelectSaved(entry)}
              onLongPress={() => setTarget(entry)}
            />
          </View>
        ))}
      </View>

      <Text className="font-body text-sm text-muted">{description}</Text>

      <ActionSheet
        visible={target !== null}
        title={target?.name ?? ''}
        actions={actions}
        onSelect={onAction}
        onClose={() => setTarget(null)}
      />
    </View>
  );
}
