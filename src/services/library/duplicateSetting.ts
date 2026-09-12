import { useEffect, useState } from 'react';

import { getHideDuplicateTracks, setHideDuplicateTracks } from '@/services/settings';

/**
 * The duplicate-hiding switch, live.
 *
 * A module-level store on top of the stored flag, for one reason: the switch is
 * in Settings and the list it changes is in the Library, and those are two tabs
 * that stay mounted side by side. Reading the preference straight out of
 * storage would leave the library showing the old answer until something
 * unrelated happened to re-render it — which, for a setting whose whole visible
 * effect is that list, reads as the switch doing nothing.
 *
 * `audioPermission` holds its one fact the same way and for the same reason.
 */

let hidden = getHideDuplicateTracks();
const listeners = new Set<(hidden: boolean) => void>();

export function getHideDuplicates(): boolean {
  return hidden;
}

/** Writes through to storage and tells every screen at once. */
export function setHideDuplicates(next: boolean): void {
  if (next === hidden) return;
  hidden = next;
  setHideDuplicateTracks(next);
  for (const listener of listeners) listener(hidden);
}

export function subscribeHideDuplicates(listener: (hidden: boolean) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The flag, re-rendering whoever reads it when it changes. */
export function useHideDuplicates(): boolean {
  const [value, setValue] = useState(getHideDuplicates);
  useEffect(() => subscribeHideDuplicates(setValue), []);
  return value;
}
