import { TabErrorBoundary } from '@/components/ui/TabErrorBoundary';
import { PlaylistsScreen } from '@/features/playlists/PlaylistsScreen';

export default function PlaylistsRoute() {
  return (
    <TabErrorBoundary>
      <PlaylistsScreen />
    </TabErrorBoundary>
  );
}
