import { useTranslation } from 'react-i18next';

import { EmptyState } from '@/components/ui/EmptyState';
import { Screen } from '@/components/ui/Screen';

export function LibraryScreen() {
  const { t } = useTranslation();

  // Phase 2 wires the folder picker; Phase 4 replaces this with the list.
  return (
    <Screen title={t('library.title')}>
      <EmptyState message={t('library.empty')} />
    </Screen>
  );
}
