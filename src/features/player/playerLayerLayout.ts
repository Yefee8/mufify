import { useSyncExternalStore } from 'react';

let tabBarHeight = 0;
const listeners = new Set<() => void>();

/** Records the measured tab-bar height for the root player layer. */
export function setPlayerTabBarHeight(nextHeight: number): void {
  if (tabBarHeight === nextHeight) return;
  tabBarHeight = nextHeight;
  for (const listener of listeners) listener();
}

/** Returns the current tab-bar height without polling layout from every route. */
export function usePlayerTabBarHeight(): number {
  return useSyncExternalStore(subscribe, getSnapshot);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): number {
  return tabBarHeight;
}
