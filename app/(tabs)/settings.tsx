import { TabErrorBoundary } from '@/components/ui/TabErrorBoundary';
import { SettingsScreen } from '@/features/settings/SettingsScreen';

export default function SettingsRoute() {
  return (
    <TabErrorBoundary>
      <SettingsScreen />
    </TabErrorBoundary>
  );
}
