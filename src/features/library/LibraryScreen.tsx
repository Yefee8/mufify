import { Music } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import { EmptyState } from '@/components/ui/EmptyState';
import { Screen } from '@/components/ui/Screen';
import { useMessages } from '@/i18n';

export function LibraryScreen() {
  const { t } = useTranslation();
  const messages = useMessages('library.empty');

  // Phase 2 wires the folder picker; Phase 4 replaces this with the list.
  return (
    <Screen title={t('library.title')}>
      <EmptyState icon={Music} messages={messages} />
    </Screen>
  );
}
