import { useTranslation } from 'react-i18next';

import { EmptyState } from '@/components/ui/EmptyState';
import { Screen } from '@/components/ui/Screen';

export function StatsScreen() {
  const { t } = useTranslation();

  return (
    <Screen title={t('stats.title')}>
      <EmptyState message={t('stats.empty')} />
    </Screen>
  );
}
