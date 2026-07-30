import { Music } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { EmptyState } from '@/components/ui/EmptyState';
import { Screen } from '@/components/ui/Screen';
import { useMessages } from '@/i18n';

import { useSeedInDevelopment, useTrackCount } from './hooks/useLibrary';

export function LibraryScreen() {
  const { t } = useTranslation();
  const messages = useMessages('library.empty');
  const trackCount = useTrackCount();

  useSeedInDevelopment(trackCount === 0);

  // Phase 2 wires the folder picker; Phase 4 replaces the count with the list.
  if (trackCount === 0) {
    return (
      <Screen title={t('library.title')}>
        <EmptyState icon={Music} messages={messages} />
      </Screen>
    );
  }

  return (
    <Screen title={t('library.title')}>
      <View className="px-6">
        <Text className="font-mono text-sm text-muted">
          {t('library.trackCount', { count: trackCount })}
        </Text>
      </View>
    </Screen>
  );
}
