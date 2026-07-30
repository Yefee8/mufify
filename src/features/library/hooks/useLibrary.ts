import { useEffect, useState } from 'react';

import { seedDatabase } from '@/db/seed';

export { useTrackCount } from '@/db/queries/tracks';

/**
 * Fill an empty database with the fake library, once, in development only.
 * Phase 2 replaces this with the real scanner.
 */
export function useSeedInDevelopment(enabled: boolean): void {
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!__DEV__ || !enabled || done) return;
    void seedDatabase().finally(() => setDone(true));
  }, [enabled, done]);
}
