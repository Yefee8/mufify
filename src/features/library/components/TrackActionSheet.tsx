import {
  CheckSquare,
  Heart,
  HeartOff,
  Info,
  ListEnd,
  ListMusic,
  ListStart,
} from 'lucide-react-native';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { ActionSheet, type ActionSheetAction } from '@/components/ui/ActionSheet';
import type { TrackListItem } from '@/db/queries/tracks';

/** What the sheet can be asked to do. The screen decides how. */
export type TrackAction =
  | 'playNext'
  | 'addToQueue'
  | 'addToPlaylist'
  | 'favorite'
  | 'select'
  | 'info';

export interface TrackActionSheetProps {
  /** The track, or null when the sheet is closed. */
  track: TrackListItem | null;
  onSelect: (action: TrackAction) => void;
  onClose: () => void;
}

/**
 * Long-press actions for one track.
 *
 * The brief's list is "play next, add to queue, add to playlist, edit tags, view
 * info, share file". Two of those are deliberately absent:
 *
 * - **Edit tags** would make this app a tag editor, which means writing to the
 *   user's files. That is a different product with a different failure mode —
 *   a bug corrupts a library rather than showing it wrong — and it is not worth
 *   smuggling in behind a long press.
 * - **Share file** needs an outward-facing intent, and this app's whole promise
 *   is that nothing leaves the device. Handing a file to another app is not a
 *   network call, but it is the one place where "offline only" would need an
 *   asterisk, and the asterisk is not worth the feature.
 *
 * Both are listed here rather than silently dropped, because a reader comparing
 * this against the brief deserves the reason.
 *
 * `select` is here as well as on the header, since long-press is where most
 * people look for multi-select first.
 */
export function TrackActionSheet({ track, onSelect, onClose }: TrackActionSheetProps) {
  const { t } = useTranslation();

  const actions = useMemo<ActionSheetAction[]>(
    () => [
      { id: 'playNext', label: t('track.playNext'), icon: ListStart, emphasis: true },
      { id: 'addToQueue', label: t('selection.addToQueue'), icon: ListEnd },
      { id: 'addToPlaylist', label: t('playlists.addTo'), icon: ListMusic },
      {
        id: 'favorite',
        label: track?.isFavorite ? t('player.unfavorite') : t('player.favorite'),
        icon: track?.isFavorite ? HeartOff : Heart,
      },
      { id: 'select', label: t('track.select'), icon: CheckSquare },
      { id: 'info', label: t('track.info'), icon: Info },
    ],
    [t, track?.isFavorite],
  );

  return (
    <ActionSheet
      visible={track !== null}
      title={track?.title ?? ''}
      subtitle={
        track
          ? [
              track.artistName ?? t('common.unknownArtist'),
              track.albumName ?? t('common.unknownAlbum'),
            ].join(' — ')
          : undefined
      }
      actions={actions}
      onSelect={(id) => onSelect(id as TrackAction)}
      onClose={onClose}
    />
  );
}
