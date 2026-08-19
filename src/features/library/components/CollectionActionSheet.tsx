import { ListEnd, ListStart, Trash2 } from 'lucide-react-native';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { ActionSheet, type ActionSheetAction } from '@/components/ui/ActionSheet';

/** What the sheet can be asked to do with a whole artist or album. */
export type CollectionAction = 'playNext' | 'addToQueue' | 'delete';

export interface CollectionActionSheetProps {
  /** Already translated. The album or artist name, or null when closed. */
  name: string | null;
  /** How many tracks it holds, for the subtitle and the delete count. */
  trackCount: number;
  /** False below Android 10, where the system cannot ask on the app's behalf. */
  canDelete: boolean;
  onSelect: (action: CollectionAction) => void;
  onClose: () => void;
}

/**
 * Long-press actions for a whole artist or album.
 *
 * The grid had no long press at all — every card did one thing, and deleting a
 * record meant opening it, selecting its dozen tracks and deleting those. The
 * shelf is where people think about whole albums, so it is where the whole-album
 * actions belong.
 *
 * Deliberately not a copy of the track sheet. Favouriting an album would mean
 * favouriting each of its tracks, which is a different thing wearing the same
 * word, and "info" about an album is the album screen — one tap away, already.
 */
export function CollectionActionSheet({
  name,
  trackCount,
  canDelete,
  onSelect,
  onClose,
}: CollectionActionSheetProps) {
  const { t } = useTranslation();

  const actions = useMemo<ActionSheetAction[]>(
    () => [
      { id: 'playNext', label: t('track.playNext'), icon: ListStart, emphasis: true },
      { id: 'addToQueue', label: t('track.addToQueue'), icon: ListEnd },
      // Last, and only where the platform can ask. Same reasoning as the track
      // sheet: it is the one action here that cannot be undone.
      ...(canDelete
        ? [{ id: 'delete', label: t('library.deleteCollection'), icon: Trash2 } as ActionSheetAction]
        : []),
    ],
    [canDelete, t],
  );

  return (
    <ActionSheet
      visible={name !== null}
      title={name ?? ''}
      subtitle={t('library.trackCount', { count: trackCount })}
      actions={actions}
      onSelect={(id) => onSelect(id as CollectionAction)}
      onClose={onClose}
    />
  );
}
