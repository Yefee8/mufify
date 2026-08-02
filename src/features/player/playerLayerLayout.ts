import { useSyncExternalStore } from 'react';

/**
 * The heights the root player layer measures and everything else needs.
 *
 * Both are real measurements rather than constants, and neither can be a
 * design-system spacing value: the tab bar's height comes from the system font
 * scale and the navigation-bar inset, and the mini player's from its own
 * content plus whatever safe area the current route leaves it.
 *
 * A module-level store read through `useSyncExternalStore` rather than context,
 * for the same reason the engine is: this changes on rotation and on the
 * player appearing, which is rare, and a context provider around every screen
 * would re-render the tree on each measurement.
 */

let tabBarHeight = 0;
let miniPlayerHeight = 0;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

/** Records the measured tab-bar height for the root player layer. */
export function setPlayerTabBarHeight(nextHeight: number): void {
  if (tabBarHeight === nextHeight) return;
  tabBarHeight = nextHeight;
  emit();
}

/**
 * Records how much of the screen the transport strip covers.
 *
 * Zero while nothing is playing, because the mini player renders nothing at
 * all then — so a list gets its full height back rather than a strip of dead
 * space under it.
 */
export function setMiniPlayerHeight(nextHeight: number): void {
  if (miniPlayerHeight === nextHeight) return;
  miniPlayerHeight = nextHeight;
  emit();
}

/** Returns the current tab-bar height without polling layout from every route. */
export function usePlayerTabBarHeight(): number {
  return useSyncExternalStore(subscribe, getTabBarHeight);
}

/**
 * Bottom padding a scrollable screen needs so its last row clears the player.
 *
 * The mini player is always visible once something is playing, and it is
 * absolutely positioned over the routes rather than laid out with them — so
 * without this the last few rows of every list sit behind it, permanently
 * unreachable. Every list and scroll view applies this to its **content
 * container**, so the strip still has content sliding under it rather than a
 * hard edge.
 *
 * One number, measured once, rather than a hand-tuned `pb-` on each screen:
 * five screens with five guesses is five things to get wrong, and four of them
 * were.
 *
 * The tab bar is deliberately *not* in it. On a tab route the screen already
 * ends where the bar begins; on a pushed route there is no bar and the strip
 * measures its own safe-area padding instead. Either way the mini player's
 * measured height is exactly the overlap.
 */
export function useMiniPlayerInset(): number {
  return useSyncExternalStore(subscribe, getMiniPlayerHeight);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getTabBarHeight(): number {
  return tabBarHeight;
}

function getMiniPlayerHeight(): number {
  return miniPlayerHeight;
}
