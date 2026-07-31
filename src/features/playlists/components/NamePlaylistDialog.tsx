import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, Text, TextInput, View } from 'react-native';

import { useThemeColors } from '@/theme/useTheme';

export interface NamePlaylistDialogProps {
  visible: boolean;
  /** Already translated. Doubles as the confirm label. */
  title: string;
  /** Prefills the field, for renaming. */
  initialName?: string;
  onCancel: () => void;
  onSubmit: (name: string) => void;
}

/**
 * Ask for a playlist name.
 *
 * A `Modal` rather than `Alert.prompt`, which is iOS-only — on Android it
 * silently does nothing, which is the kind of platform gap that ships.
 */
export function NamePlaylistDialog({
  visible,
  title,
  initialName = '',
  onCancel,
  onSubmit,
}: NamePlaylistDialogProps) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const [name, setName] = useState(initialName);

  // Reset on open, so a cancelled edit does not reappear the next time. An
  // effect would do this too, but `onShow` is the actual event — React 19
  // rightly flags setState inside an effect that is really an event handler.
  const resetToInitial = useCallback(() => setName(initialName), [initialName]);

  const trimmed = name.trim();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onShow={resetToInitial}
      onRequestClose={onCancel}
    >
      {/* Tapping the scrim dismisses, which is what the gesture means. */}
      <Pressable
        onPress={onCancel}
        accessibilityRole="button"
        accessibilityLabel={t('common.cancel')}
        className="flex-1 items-center justify-center bg-surface/80 px-6"
      >
        {/* Swallows taps so pressing inside the card does not close it. */}
        <Pressable
          onPress={stopPropagation}
          className="w-full gap-4 rounded-md border border-subtle bg-surface-elevated p-5"
        >
          <Text className="font-body-semibold text-base text-primary">{title}</Text>

          <TextInput
            value={name}
            onChangeText={setName}
            autoFocus
            placeholder={t('playlists.namePlaceholder')}
            placeholderTextColor={colors.legend}
            accessibilityLabel={t('playlists.nameLabel')}
            returnKeyType="done"
            onSubmitEditing={() => trimmed && onSubmit(trimmed)}
            className="min-h-11 rounded-sm border border-subtle px-4 font-body text-base text-primary"
          />

          <View className="flex-row justify-end gap-3">
            <Pressable
              onPress={onCancel}
              accessibilityRole="button"
              className="min-h-11 justify-center px-4"
            >
              <Text className="font-body-medium text-sm text-muted">{t('common.cancel')}</Text>
            </Pressable>

            <Pressable
              onPress={() => onSubmit(trimmed)}
              disabled={trimmed.length === 0}
              accessibilityRole="button"
              accessibilityState={{ disabled: trimmed.length === 0 }}
              className="min-h-11 justify-center px-4"
            >
              <Text
                className={
                  trimmed.length === 0
                    ? 'font-body-medium text-sm text-muted'
                    : 'font-body-medium text-sm text-accent'
                }
              >
                {t('common.save')}
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function stopPropagation(): void {
  // Intentionally empty: the press is absorbed rather than handled.
}
