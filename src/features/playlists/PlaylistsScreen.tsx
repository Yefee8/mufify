import { useTranslation } from 'react-i18next';

import { EmptyState } from '@/components/ui/EmptyState';
import { Screen } from '@/components/ui/Screen';

export function PlaylistsScreen() {
  const { t } = useTranslation();

  return (
    <Screen title={t('playlists.title')}>
      <EmptyState message={t('playlists.empty')} />
    </Screen>
  );
}
