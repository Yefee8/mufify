import { TabErrorBoundary } from '@/components/ui/TabErrorBoundary';
import { StatsScreen } from '@/features/stats/StatsScreen';

export default function StatsRoute() {
  return (
    <TabErrorBoundary>
      <StatsScreen />
    </TabErrorBoundary>
  );
}
