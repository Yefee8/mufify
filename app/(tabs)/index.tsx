import { TabErrorBoundary } from '@/components/ui/TabErrorBoundary';
import { LibraryScreen } from '@/features/library/LibraryScreen';

export default function LibraryRoute() {
  return (
    <TabErrorBoundary>
      <LibraryScreen />
    </TabErrorBoundary>
  );
}
