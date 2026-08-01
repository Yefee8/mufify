import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, Text, View } from 'react-native';

import { ProgressBar } from '@/components/ui/ProgressBar';
import { useMessages } from '@/i18n';
import type { ScanProgress } from '@/services/scanner/scanner';

export interface FolderImportModalProps {
  progress: ScanProgress;
  onCancel: () => void;
}

/** Blocks navigation during a chosen-folder import while scan batches keep yielding. */
export function FolderImportModal({ progress, onCancel }: FolderImportModalProps) {
  const { t } = useTranslation();
  const messages = useMessages('library.importing.messages');
  const [messageIndex] = useState(() => Math.floor(Math.random() * Math.max(messages.length, 1)));
  const label =
    progress.phase === 'enumerating'
      ? t('library.scanning.enumerating')
      : progress.phase === 'enriching'
        ? t('library.scanning.enriching')
        : t('library.importing.preparing');
  const ratio = progress.total > 0 ? progress.processed / progress.total : 0;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onCancel}>
      <View className="flex-1 justify-center bg-surface px-6">
        <View className="gap-5">
          <Text className="font-display text-3xl text-primary">{t('library.importing.title')}</Text>
          <Text className="font-body text-base text-muted">{messages[messageIndex] ?? ''}</Text>
          <View className="gap-2">
            <View className="flex-row items-center justify-between">
              <Text className="font-body-medium text-sm text-primary">{label}</Text>
              {progress.total > 0 ? (
                <Text className="font-mono text-sm text-muted">
                  {progress.processed} / {progress.total}
                </Text>
              ) : null}
            </View>
            <ProgressBar value={ratio} accessibilityLabel={label} />
          </View>
          <Pressable
            onPress={onCancel}
            accessibilityRole="button"
            accessibilityLabel={t('library.scanning.cancel')}
            className="min-h-11 items-center justify-center rounded-sm border border-subtle px-4"
          >
            <Text className="font-body-medium text-base text-accent">
              {t('library.scanning.cancel')}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
