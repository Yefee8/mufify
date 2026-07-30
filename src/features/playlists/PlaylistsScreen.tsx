import { ListMusic } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import { EmptyState } from '@/components/ui/EmptyState';
import { Screen } from '@/components/ui/Screen';
import { useMessages } from '@/i18n';

export function PlaylistsScreen() {
  const { t } = useTranslation();
  const messages = useMessages('playlists.empty');

  return (
    <Screen title={t('playlists.title')}>
      <EmptyState icon={ListMusic} messages={messages} />
    </Screen>
  );
}
