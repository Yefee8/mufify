import { useEffect } from 'react';

import { count } from './index';

/**
 * Count a component's mounts and renders.
 *
 * Answers the question a tab-switch complaint always turns out to be about:
 * whether the screen is being rebuilt from nothing each time, or kept and
 * re-rendered, or kept and not re-rendered at all. Those three have completely
 * different fixes and look identical from the outside.
 *
 * Dev-only via `count`. Left in the tree after the measurement because the
 * next performance question will want it too, and re-adding instrumentation is
 * how a "fix" ends up unverified.
 */
export function useLifecycleTrace(label: string): void {
  // `count` keeps the running total in module state rather than a ref, so this
  // does not write to a ref during render — which React 19 rightly rejects.
  count(`${label}.render`);

  useEffect(() => {
    count(`${label}.mount`);
    return () => count(`${label}.unmount`);
  }, [label]);
}
