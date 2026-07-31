import { useCallback, useMemo, useState } from 'react';

import { commitFeedback, liftFeedback, tapFeedback } from '@/services/haptics';

export interface Selection {
  /** True while the list is in selection mode, even with nothing selected. */
  isActive: boolean;
  /** Selected ids, in the order they were picked. */
  ids: number[];
  has: (id: number) => boolean;
  toggle: (id: number) => void;
  /** Enter selection mode with nothing picked. From the header button. */
  activate: () => void;
  /** Enter selection mode with this id already picked. From a long press. */
  begin: (id: number) => void;
  /** Select every id given, or clear if they are all already selected. */
  toggleAll: (ids: number[]) => void;
  /** Leave selection mode and forget everything. */
  clear: () => void;
}

/**
 * Which rows are selected, and whether selection mode is on at all.
 *
 * Insertion order is kept rather than sorted by id. Selecting four tracks and
 * adding them to a playlist should put them in the playlist in the order they
 * were tapped — sorting by primary key would reorder them by when they were
 * scanned, which is arbitrary from the user's side.
 *
 * `isActive` is separate from `ids.length > 0` on purpose. Deselecting the last
 * row must not drop out of selection mode: the user is mid-task and about to
 * pick a different row, and having the checkboxes vanish under them is the
 * behaviour that makes multi-select feel unusable.
 */
export function useSelection(): Selection {
  const [isActive, setActive] = useState(false);
  const [ids, setIds] = useState<number[]>([]);

  const selected = useMemo(() => new Set(ids), [ids]);

  const has = useCallback((id: number) => selected.has(id), [selected]);

  const toggle = useCallback((id: number) => {
    tapFeedback();
    setIds((current) =>
      current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id],
    );
  }, []);

  /*
   * Two entry points rather than one with a sentinel id.
   *
   * This was `begin(-1)` from the header, on the theory that -1 matches no row.
   * It does not match a row and it *is* still added to the list, so the bar
   * opened reading "1 selected" with nothing ticked, and `toggleAll`'s
   * length comparison was permanently off by one. Caught on the emulator, not
   * by a type.
   */
  const activate = useCallback(() => {
    liftFeedback();
    setActive(true);
  }, []);

  const begin = useCallback((id: number) => {
    liftFeedback();
    setActive(true);
    setIds((current) => (current.includes(id) ? current : [...current, id]));
  }, []);

  const toggleAll = useCallback((all: number[]) => {
    commitFeedback();
    setIds((current) => (current.length === all.length ? [] : all));
  }, []);

  const clear = useCallback(() => {
    setActive(false);
    setIds([]);
  }, []);

  return { isActive, ids, has, toggle, activate, begin, toggleAll, clear };
}
