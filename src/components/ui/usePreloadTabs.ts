import { useEffect, useRef } from 'react';

/** What this needs from the tab navigator: its routes, and a way to warm one. */
export interface PreloadableTabs {
  state: { index: number; routes: readonly { name: string }[] };
  /** The router's own preload, from any tab's navigation object. */
  preload: (name: string) => void;
}

/** Long enough after launch that the first tab has drawn and settled. */
const FIRST_DELAY_MS = 1_500;
/** Between tabs, so warming one never queues behind another. */
const GAP_MS = 400;

/**
 * Build the tabs nobody has opened yet, while nothing else is happening.
 *
 * Tabs mount the first time they are pressed, and Settings and Statistics are
 * large trees: on the Mi 9T that first press was the half-second wait people
 * reported as "tab switches are slow". Preloading builds each one hidden, one
 * at a time, when the JS thread is idle — so the first press only has to show
 * it. The router's own `preload`, so a preloaded tab is the same screen the
 * press would have built, with its state, rather than a copy.
 *
 * Once per launch: a tab that has been built stays built.
 */
export function usePreloadTabs({ state, preload }: PreloadableTabs): void {
  // Read once. The order is fixed by the layout and does not change.
  const names = state.routes.map((route) => route.name);
  const focused = names[state.index];
  const key = names.join('|');
  // Which tab is on screen when each warm-up fires, not when the bar mounted:
  // a tab the user has already opened is built and needs nothing.
  const current = useRef(focused);
  const visited = useRef(new Set<string>());
  // Held in a ref: the bar hands over a new function every render, and the
  // warm-up must neither restart for it nor call a stale one.
  const preloadRef = useRef(preload);
  useEffect(() => {
    current.current = focused;
    preloadRef.current = preload;
    if (focused !== undefined) visited.current.add(focused);
  }, [focused, preload]);

  useEffect(() => {
    const pending = names.filter((name) => name !== focused);
    let timer: ReturnType<typeof setTimeout> | undefined;
    let idle: number | undefined;
    let cancelled = false;

    const warm = (index: number, delay: number): void => {
      if (index >= pending.length) return;
      timer = setTimeout(() => {
        // Idle, but not indefinitely: a timeout keeps a busy launch from
        // postponing the warm-up until the user has already pressed the tab.
        idle = requestIdleCallback(
          () => {
            if (cancelled) return;
            const name = pending[index];
            if (name !== undefined && name !== current.current && !visited.current.has(name)) {
              preloadRef.current(name);
            }
            warm(index + 1, GAP_MS);
          },
          { timeout: 1_000 },
        );
      }, delay);
    };

    warm(0, FIRST_DELAY_MS);

    return () => {
      cancelled = true;
      if (timer !== undefined) clearTimeout(timer);
      if (idle !== undefined) cancelIdleCallback(idle);
    };
    // Launch-only: `names` and `focused` are read when the bar first mounts,
    // and pressing a tab must not restart the warm-up from the beginning.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}
