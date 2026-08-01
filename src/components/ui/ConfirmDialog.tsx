import { useTranslation } from 'react-i18next';
import { Modal, Pressable, Text, View } from 'react-native';

export interface ConfirmDialogProps {
  visible: boolean;
  /** Already translated. */
  title: string;
  /** Already translated. What is about to happen, in one or two plain sentences. */
  body: string;
  /** Already translated. Names the action rather than saying "OK". */
  confirmLabel: string;
  /** Draws the confirm in red. For anything that destroys data. */
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Ask before doing something slow or irreversible.
 *
 * A `Modal` rather than `Alert.alert`, for the same reason `NamePlaylistDialog`
 * is: the platform dialog cannot be themed, and a system-grey box in the middle
 * of a dark hi-fi panel looks like a different application interrupted.
 *
 * The confirm button says what it will do — "Scan", "Delete history" — never
 * "OK". A dialog whose buttons are "OK" and "Cancel" makes the user re-read the
 * body to find out which one is safe.
 */
export function ConfirmDialog({
  visible,
  title,
  body,
  confirmLabel,
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const { t } = useTranslation();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable
        onPress={onCancel}
        accessibilityRole="button"
        accessibilityLabel={t('common.cancel')}
        className="flex-1 items-center justify-center bg-surface/80 px-6"
      >
        <Pressable
          onPress={absorb}
          className="w-full gap-3 rounded-md border border-subtle bg-surface-elevated p-5"
        >
          <Text className="font-body-semibold text-base text-primary">{title}</Text>
          <Text className="font-body text-sm text-muted">{body}</Text>

          <View className="flex-row justify-end gap-3 pt-1">
            <Pressable
              onPress={onCancel}
              accessibilityRole="button"
              className="min-h-11 justify-center px-4"
            >
              <Text className="font-body-medium text-sm text-muted">{t('common.cancel')}</Text>
            </Pressable>

            <Pressable
              onPress={onConfirm}
              accessibilityRole="button"
              className="min-h-11 justify-center px-4"
            >
              <Text
                className={
                  destructive
                    ? 'font-body-medium text-sm text-danger'
                    : 'font-body-medium text-sm text-accent'
                }
              >
                {confirmLabel}
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function absorb(): void {
  // Intentionally empty: the press is absorbed rather than handled.
}
