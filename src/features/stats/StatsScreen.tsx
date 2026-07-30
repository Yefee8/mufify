import { BarChart3 } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import { EmptyState } from '@/components/ui/EmptyState';
import { Screen } from '@/components/ui/Screen';
import { useMessages } from '@/i18n';

export function StatsScreen() {
  const { t } = useTranslation();
  const messages = useMessages('stats.empty');

  return (
    <Screen title={t('stats.title')}>
      <EmptyState icon={BarChart3} messages={messages} />
    </Screen>
  );
}
