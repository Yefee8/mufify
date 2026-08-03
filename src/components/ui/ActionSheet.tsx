import type { LucideIcon } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SPACING } from '@/theme/tokens';
import { useThemeColors } from '@/theme/useTheme';

export interface ActionSheetAction {
  /** Stable key, and what the caller switches on. */
  id: string;
  /** Already translated. */
  label: string;
  icon: LucideIcon;
  /** Draws in the accent rather than the label colour. One per sheet, at most. */
  emphasis?: boolean;
}

export interface ActionSheetProps {
  visible: boolean;
  /** Already translated. Names what the actions apply to. */
  title: string;
  /** Optional second line — an artist, a count. Already translated. */
  subtitle?: string;
  actions: readonly ActionSheetAction[];
  onSelect: (id: string) => void;
  onClose: () => void;
}

/**
 * A sheet of actions for one thing.
 *
 * The brief asks for a long-press action sheet on every track, and the same
 * shape serves albums, artists and playlist entries — so it takes a list of
 * actions rather than knowing what any of them mean.
 *
 * Selecting an action closes the sheet before running it. A sheet that lingers
 * while a track loads reads as a press that did not register, and the second
 * press then does the action twice.
 */
export function ActionSheet({
  visible,
  title,
  subtitle,
  actions,
  onSelect,
  onClose,
}: ActionSheetProps) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel={t('common.cancel')}
        className="flex-1 justify-end bg-surface/80"
      >
        {/*
          Absorbs taps so pressing the sheet does not dismiss it, and stands off
          the navigation bar.

          A sheet anchored to the bottom of the window sits *under* the system
          buttons on a three-button device — the last action in the list was
          behind them and could not be pressed. The padding goes on the panel
          rather than around it so the surface still runs to the bottom edge and
          only its contents stop short, which is what Now Playing's transport
          row does for the same reason.
        */}
        <Pressable
          onPress={absorb}
          style={{ paddingBottom: insets.bottom + SPACING[5] }}
          className="max-h-full gap-1 rounded-md border border-subtle bg-surface-elevated px-5 pt-5"
        >
          <View className="gap-1 pb-3">
            <Text numberOfLines={1} className="font-body-semibold text-base text-primary">
              {title}
            </Text>
            {subtitle ? (
              <Text numberOfLines={1} className="font-body text-sm text-muted">
                {subtitle}
              </Text>
            ) : null}
          </View>

          <ScrollView>
            {actions.map((action) => (
              <Pressable
                key={action.id}
                onPress={() => {
                  onClose();
                  onSelect(action.id);
                }}
                accessibilityRole="button"
                accessibilityLabel={action.label}
                className="min-h-11 flex-row items-center gap-4 py-1"
              >
                <action.icon
                  color={action.emphasis ? colors.signal : colors.legend}
                  size={20}
                  strokeWidth={2}
                />
                <Text
                  className={
                    action.emphasis
                      ? 'font-body-medium text-base text-accent'
                      : 'font-body text-base text-primary'
                  }
                >
                  {action.label}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function absorb(): void {
  // Stops a tap inside the sheet from reaching the dismissing scrim.
}
