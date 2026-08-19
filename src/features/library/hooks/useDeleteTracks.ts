import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { TrackListItem } from '@/db/queries/tracks';
import { retireTracks } from '@/db/queries/tracks';
import { rejectFeedback } from '@/services/haptics';
import { canDeleteFiles, deleteTracks } from '@/services/library/deleteTracks';
import { showToast } from '@/services/toast';

export interface UseDeleteTracksResult {
  /** False below Android 10; the screens hide the action entirely. */
  canDelete: boolean;
  /** The tracks awaiting confirmation, or an empty list when nothing is. */
  pending: readonly TrackListItem[];
  /** Put a delete in front of the user. */
  ask: (tracks: readonly TrackListItem[]) => void;
  /** Back out. */
  cancel: () => void;
  /** Go ahead: the system takes it from here. */
  confirm: () => void;
}

/**
 * Deleting tracks, with the one confirmation that is this app's to give.
 *
 * The system draws its own dialog and it is the one that matters — it names the
 * files, it cannot be impersonated, and nothing is deleted without it. So this
 * one exists for a narrower reason: to say **how many**, before the user is
 * handed either a system dialog listing twelve files or, on Android 10, twelve
 * dialogs in a row. Neither is something to walk into by mistake, and by the
 * time the first one appears it is too late to count.
 *
 * Silent about a refusal. Declining is an answer, not a failure, and a toast
 * reporting it would be the app commenting on a decision the user just made.
 * Files the platform would not touch *are* reported: that one is not a choice,
 * and without a message the row simply stays put for no visible reason.
 */
export function useDeleteTracks(): UseDeleteTracksResult {
  const { t } = useTranslation();
  const [pending, setPending] = useState<readonly TrackListItem[]>([]);

  // Read once: it depends on the Android version, which does not change while
  // the app is running.
  const canDelete = useMemo(() => canDeleteFiles(), []);

  const ask = useCallback((tracks: readonly TrackListItem[]) => {
    if (tracks.length > 0) setPending(tracks);
  }, []);

  const cancel = useCallback(() => setPending([]), []);

  const confirm = useCallback(() => {
    const tracks = pending;
    setPending([]);
    if (tracks.length === 0) return;

    void (async () => {
      const outcome = await deleteTracks(tracks, retireTracks);

      if (outcome.deleted > 0) {
        showToast(t('toast.deleted', { count: outcome.deleted }));
      }
      if (outcome.failed > 0) {
        rejectFeedback();
        showToast(t('toast.deleteFailed', { count: outcome.failed }));
      }
    })();
  }, [pending, t]);

  return { canDelete, pending, ask, cancel, confirm };
}
