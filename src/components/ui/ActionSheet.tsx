import type { LucideIcon } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';

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

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel={t('common.cancel')}
        className="flex-1 justify-end bg-surface/80"
      >
        {/* Absorbs taps so pressing the sheet does not dismiss it. */}
        <Pressable
          onPress={absorb}
          className="max-h-96 gap-1 rounded-md border border-subtle bg-surface-elevated p-5"
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
