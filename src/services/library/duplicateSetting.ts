import { useEffect, useState } from 'react';

import type { DuplicateMatch } from '@/services/library/dedupeTracks';
import {
  getDuplicateMatch,
  getHideDuplicateTracks,
  setDuplicateMatch,
  setHideDuplicateTracks,
} from '@/services/settings';

/**
 * The duplicate-hiding setting, live: whether to hide, and what counts as a
 * duplicate.
 *
 * A module-level store on top of the stored preferences, for one reason: the
 * controls are in Settings and the list they change is in the Library, and
 * those are two tabs that stay mounted side by side. Reading the preference
 * straight out of storage would leave the library showing the old answer until
 * something unrelated happened to re-render it — which, for a setting whose
 * whole visible effect is that list, reads as the switch doing nothing.
 *
 * `audioPermission` holds its one fact the same way and for the same reason.
 */

export interface DuplicateSetting {
  hidden: boolean;
  match: DuplicateMatch;
}

let current: DuplicateSetting = { hidden: getHideDuplicateTracks(), match: getDuplicateMatch() };
const listeners = new Set<(setting: DuplicateSetting) => void>();

export function getDuplicateSetting(): DuplicateSetting {
  return current;
}

export function getHideDuplicates(): boolean {
  return current.hidden;
}

/** Writes through to storage and tells every screen at once. */
export function setHideDuplicates(next: boolean): void {
  if (next === current.hidden) return;
  setHideDuplicateTracks(next);
  publish({ ...current, hidden: next });
}

/** The same, for what makes two rows one song. */
export function setDuplicateMatching(next: DuplicateMatch): void {
  if (next === current.match) return;
  setDuplicateMatch(next);
  publish({ ...current, match: next });
}

function publish(next: DuplicateSetting): void {
  current = next;
  for (const listener of listeners) listener(current);
}

export function subscribeDuplicateSetting(
  listener: (setting: DuplicateSetting) => void,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Both facts, re-rendering whoever reads them when either changes. */
export function useDuplicateSetting(): DuplicateSetting {
  const [value, setValue] = useState(getDuplicateSetting);
  useEffect(() => subscribeDuplicateSetting(setValue), []);
  return value;
}
