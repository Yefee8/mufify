import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { runOnUI } from 'react-native-reanimated';

import { movePlaylistEntry, type PlaylistEntry } from '@/db/queries/playlists';
import { moveItem } from '@/services/playlists/order';

import { release } from '../reorderDrag';

export interface ReorderableEntries {
  /** The order to render: the query's, or the one a drag is making. */
  entries: PlaylistEntry[];
  /** The row being dragged, for the floating copy, and which drag this is. */
  dragged: { entry: PlaylistEntry; session: number } | null;
  onPickUp: (entryId: number, index: number) => void;
  onSlotChange: (from: number, to: number) => void;
  onLanded: () => void;
}

/**
 * A playlist's entries, reordered live while a row is dragged.
 *
 * Each time the held row crosses into another slot the list is reordered for
 * real, so the rows underneath are always in the order on screen and the drop
 * has nothing to reconcile — see `reorderDrag` for why that matters. The
 * database is written once, when the row lands, as "this row after that one";
 * the query's next result then replaces the live copy.
 *
 * Whatever the query says wins once the drag is over, even when it disagrees
 * with the drop: if the write was rejected, or the playlist changed
 * underneath, or a rescan marked a file missing, the live copy is hiding the
 * truth. While a drag is in progress the live copy wins instead — a result
 * arriving mid-drag would otherwise snap the list back under the finger.
 *
 * `beforeReorder` runs before each live step; the screen uses it to have the
 * next layout animated rather than jumped.
 */
export function useReorderableEntries(
  playlistId: number,
  entries: PlaylistEntry[],
  beforeReorder: () => void,
): ReorderableEntries {
  const [pending, setPending] = useState<{ of: PlaylistEntry[]; order: PlaylistEntry[] } | null>(
    null,
  );
  const [dragged, setDragged] = useState<{ entry: PlaylistEntry; session: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [landings, setLandings] = useState(0);

  const shown = pending !== null && (dragging || pending.of === entries) ? pending.order : entries;

  /**
   * The order as of the latest slot change, synchronously.
   *
   * Slot changes arrive from the UI thread faster than React renders them, so
   * each one is applied to this rather than to the last rendered order — two
   * crossings in one frame must compose, not overwrite each other.
   */
  const live = useRef<{ order: PlaylistEntry[]; entryId: number; from: number } | null>(null);
  const landing = useRef(false);

  const onPickUp = useCallback(
    (entryId: number, index: number) => {
      const entry = shown[index];
      if (entry === undefined || entry.entryId !== entryId) return;
      live.current = { order: shown, entryId, from: index };
      setDragging(true);
      setDragged((previous) => ({ entry, session: (previous?.session ?? 0) + 1 }));
    },
    [shown],
  );

  const onSlotChange = useCallback(
    (from: number, to: number) => {
      const current = live.current;
      if (current === null) return;
      const next = moveItem(current.order, from, to);
      if (next === null) return;
      live.current = { ...current, order: next };
      beforeReorder();
      setPending({ of: entries, order: next });
    },
    [beforeReorder, entries],
  );

  const onLanded = useCallback(() => {
    const current = live.current;
    live.current = null;
    landing.current = true;
    setDragging(false);
    setLandings((count) => count + 1);
    if (current === null) return;

    // Keyed to the latest result, so a result that arrived mid-drag does not
    // expire the live copy the moment the finger lifts and show the list
    // without the move for as long as the write takes.
    setPending({ of: entries, order: current.order });

    const index = current.order.findIndex((entry) => entry.entryId === current.entryId);
    if (index === -1 || index === current.from) return;
    const after = index === 0 ? null : (current.order[index - 1]?.entryId ?? null);
    void movePlaylistEntry(playlistId, current.entryId, after);
  }, [entries, playlistId]);

  /*
   * Hand the row back once the landing has been committed.
   *
   * By then the final order is on screen with the held row hidden in its slot
   * and the copy covering it; showing one and hiding the other is two values on
   * the UI thread, so it happens in one frame whatever the JS thread is doing.
   */
  useLayoutEffect(() => {
    if (!landing.current) return;
    landing.current = false;
    runOnUI(release)();
  }, [landings]);

  return { entries: shown, dragged, onPickUp, onSlotChange, onLanded };
}
