import { Heart, HeartOff, ListEnd, ListStart, Trash2 } from 'lucide-react-native';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { ActionSheet, type ActionSheetAction } from '@/components/ui/ActionSheet';

/** What the sheet can be asked to do with a whole artist or album. */
export type CollectionAction = 'playNext' | 'addToQueue' | 'favorite' | 'delete';

export interface CollectionActionSheetProps {
  /** Already translated. The album or artist name, or null when closed. */
  name: string | null;
  /** How many tracks it holds, for the subtitle and the delete count. */
  trackCount: number;
  /** False below Android 10, where the system cannot ask on the app's behalf. */
  canDelete: boolean;
  /**
   * Whether liking is offered at all.
   *
   * Albums only. An artist has no row of its own to write a flag to, and the
   * reserved "no album" card is the *absence* of an album rather than one —
   * there is nothing there to like.
   */
  canFavorite: boolean;
  isFavorite: boolean;
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
 * Liking an album is the album's own flag, not a shortcut for liking each of
 * its tracks — those are two different statements, and collapsing them would
 * make Liked Songs fill up with a record somebody merely bookmarked.
 *
 * "Info" is deliberately absent: for an album that is the album screen, one tap
 * away already.
 */
export function CollectionActionSheet({
  name,
  trackCount,
  canDelete,
  canFavorite,
  isFavorite,
  onSelect,
  onClose,
}: CollectionActionSheetProps) {
  const { t } = useTranslation();

  const actions = useMemo<ActionSheetAction[]>(
    () => [
      { id: 'playNext', label: t('track.playNext'), icon: ListStart, emphasis: true },
      { id: 'addToQueue', label: t('track.addToQueue'), icon: ListEnd },
      ...(canFavorite
        ? [
            {
              id: 'favorite',
              label: isFavorite ? t('library.unlikeAlbum') : t('library.likeAlbum'),
              icon: isFavorite ? HeartOff : Heart,
            } as ActionSheetAction,
          ]
        : []),
      // Last, and only where the platform can ask. Same reasoning as the track
      // sheet: it is the one action here that cannot be undone.
      ...(canDelete
        ? [{ id: 'delete', label: t('library.deleteCollection'), icon: Trash2 } as ActionSheetAction]
        : []),
    ],
    [canDelete, canFavorite, isFavorite, t],
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
