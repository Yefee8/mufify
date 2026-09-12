import { Check, ChevronDown, Share2, Trash2, User } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EQUALIZER_PRESET_IDS, type EqualizerPresetId } from '@/services/equalizer/presets';
import type { SavedPreset } from '@/services/equalizer/savedPresets';
import { SPACING } from '@/theme/tokens';
import { useThemeColors } from '@/theme/useTheme';

export interface PresetPickerProps {
  /** The built-in selection. `custom` when a band has been dragged. */
  preset: EqualizerPresetId;
  /** The user's presets, and which of them is loaded. */
  saved: readonly SavedPreset[];
  activeId: string | null;
  onSelectBuiltIn: (id: EqualizerPresetId) => void;
  onSelectSaved: (preset: SavedPreset) => void;
  onShare: (preset: SavedPreset) => void;
  onForget: (preset: SavedPreset) => void;
}

/**
 * Which curve is playing, and a way to change it.
 *
 * This replaced two horizontal chip rows — eight built-in presets in one,
 * however many saved ones in another — and they had two problems that got
 * worse as the second list grew. A row you have to scroll sideways hides its
 * own contents: the selected chip was regularly off-screen, which is why the
 * old code had to scroll it back into view by hand after every change. And two
 * rows of identical chips made the user's own presets look like more built-ins.
 *
 * So: one row that **says what is selected**, and a sheet that shows everything
 * at once, in two named sections. Nothing is hidden, nothing needs scrolling
 * back into view, and the sections carry the distinction the chips could not.
 *
 * **A preset the user made is drawn in the accent colour**, in the sheet and in
 * the row. That is the one piece of colour in this control and it means exactly
 * one thing: this is yours, you named it, you can delete it. The built-ins are
 * the label colour, because they are furniture.
 */
export function PresetPicker({
  preset,
  saved,
  activeId,
  onSelectBuiltIn,
  onSelectSaved,
  onShare,
  onForget,
}: PresetPickerProps) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();

  const [open, setOpen] = useState(false);
  /** Which saved preset's share/delete row is showing. */
  const [expanded, setExpanded] = useState<string | null>(null);

  const active = saved.find((entry) => entry.id === activeId) ?? null;
  const label = active ? active.name : t(`settings.equalizer.presets.${preset}`);

  const close = useCallback(() => {
    setOpen(false);
    setExpanded(null);
  }, []);

  const pickBuiltIn = useCallback(
    (id: EqualizerPresetId) => {
      close();
      onSelectBuiltIn(id);
    },
    [close, onSelectBuiltIn],
  );

  const pickSaved = useCallback(
    (entry: SavedPreset) => {
      close();
      onSelectSaved(entry);
    },
    [close, onSelectSaved],
  );

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={t('settings.equalizer.preset')}
        accessibilityValue={{ text: label }}
        className="min-h-11 flex-row items-center gap-3 rounded-sm border border-subtle px-4 py-2"
      >
        <View className="flex-1">
          <Text className="font-body text-sm text-muted">{t('settings.equalizer.preset')}</Text>
          <Text
            numberOfLines={1}
            className={
              active
                ? 'font-body-medium text-base text-accent'
                : 'font-body-medium text-base text-primary'
            }
          >
            {label}
          </Text>
        </View>
        <ChevronDown color={colors.legend} size={20} strokeWidth={2} />
      </Pressable>

      <Modal visible={open} transparent animationType="slide" onRequestClose={close}>
        <Pressable
          onPress={close}
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
          className="flex-1 justify-end bg-surface/80"
        >
          {/* Absorbs taps, and stands off the navigation bar — a sheet anchored
              to the window bottom puts its last row under the system buttons. */}
          <Pressable
            onPress={absorb}
            style={{ paddingBottom: insets.bottom + SPACING[5] }}
            className="max-h-full rounded-md border border-subtle bg-surface-elevated px-5 pt-5"
          >
            <Text className="pb-2 font-body-semibold text-base text-primary">
              {t('settings.equalizer.preset')}
            </Text>

            <ScrollView>
              <Section label={t('settings.equalizer.builtIn')} />

              {EQUALIZER_PRESET_IDS.map((id) => (
                <Row
                  key={id}
                  label={t(`settings.equalizer.presets.${id}`)}
                  description={t(`settings.equalizer.presetHints.${id}`)}
                  selected={active === null && id === preset}
                  onPress={() => pickBuiltIn(id)}
                />
              ))}

              {saved.length > 0 ? (
                <>
                  <Section label={t('settings.equalizer.yours')} />

                  {saved.map((entry) => (
                    <View key={entry.id}>
                      <Row
                        label={entry.name}
                        /* Long press rather than a row of icons per preset: the
                           list is for choosing, and share and delete are things
                           you do to one you have already found. */
                        description={t('settings.equalizer.savedHint')}
                        selected={entry.id === activeId}
                        mine
                        onPress={() => pickSaved(entry)}
                        onLongPress={() =>
                          setExpanded((current) => (current === entry.id ? null : entry.id))
                        }
                      />

                      {expanded === entry.id ? (
                        <View className="flex-row gap-2 pb-2 pl-8">
                          <Minor
                            icon={Share2}
                            label={t('settings.equalizer.share')}
                            onPress={() => {
                              close();
                              onShare(entry);
                            }}
                          />
                          <Minor
                            icon={Trash2}
                            label={t('settings.equalizer.forget')}
                            onPress={() => {
                              setExpanded(null);
                              onForget(entry);
                            }}
                          />
                        </View>
                      ) : null}
                    </View>
                  ))}
                </>
              ) : null}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

function Section({ label }: { label: string }) {
  return (
    <Text className="pb-1 pt-3 font-mono text-sm text-muted" accessibilityRole="header">
      {label}
    </Text>
  );
}

interface RowProps {
  label: string;
  description: string;
  selected: boolean;
  /** One the user made. Drawn in the accent, so the two kinds never blur. */
  mine?: boolean;
  onPress: () => void;
  onLongPress?: () => void;
}

function Row({ label, description, selected, mine = false, onPress, onLongPress }: RowProps) {
  const colors = useThemeColors();

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      accessibilityHint={description}
      className="min-h-11 flex-row items-start gap-3 py-2"
    >
      {/* The tick marks the selection rather than a filled row: every row here
          carries a sentence, and filling one would put body text on indigo. */}
      <View className="w-5 pt-1">
        {selected ? <Check color={colors.signal} size={18} strokeWidth={2.5} /> : null}
      </View>

      <View className="flex-1">
        <View className="flex-row items-center gap-2">
          {mine ? <User color={colors.signal} size={14} strokeWidth={2} /> : null}
          <Text
            numberOfLines={1}
            className={
              mine
                ? 'font-body-medium text-base text-accent'
                : 'font-body-medium text-base text-primary'
            }
          >
            {label}
          </Text>
        </View>
        <Text className="font-body text-sm text-muted">{description}</Text>
      </View>
    </Pressable>
  );
}

interface MinorProps {
  icon: typeof Share2;
  label: string;
  onPress: () => void;
}

function Minor({ icon: Icon, label, onPress }: MinorProps) {
  const colors = useThemeColors();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      className="min-h-11 flex-row items-center gap-2 rounded-sm border border-subtle px-3"
    >
      <Icon color={colors.legend} size={16} strokeWidth={2} />
      <Text className="font-body text-sm text-primary">{label}</Text>
    </Pressable>
  );
}

function absorb(): void {
  // Pressing the panel must not close the sheet behind it.
}
