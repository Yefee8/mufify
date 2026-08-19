import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { setPlaylistCover } from '@/db/queries/playlists';
import {
  cropCoverTo,
  discardCoverSource,
  pickCoverSource,
  type CoverSource,
} from '@/services/playlists/cover';
import type { CropRect } from '@/services/playlists/cropGeometry';
import { showToast } from '@/services/toast';

export interface PlaylistCover {
  /** The action sheet — choose, replace or remove — is on screen. */
  choosing: boolean;
  open: () => void;
  close: () => void;
  /** The picked image awaiting a crop. Null means the cropper is closed. */
  cropping: CoverSource | null;
  /** Open the system picker, then the cropper on what it returns. */
  pick: () => void;
  cancelCrop: () => void;
  confirmCrop: (rect: CropRect) => void;
  /** Back to the four-square mosaic. */
  clear: () => void;
}

/**
 * Giving a playlist a picture, in the three steps it actually takes.
 *
 * Pick, frame, keep. Held together here rather than in the screen because the
 * screen had grown past the 300 lines `AGENTS.md` allows, and because the three
 * are one flow with one piece of state between them: what has been picked but
 * not yet committed to.
 *
 * The middle step is the reason this is not one function. A cover is square and
 * a photograph is not, so a pick is a *candidate* rather than a cover — it
 * lands in the cache, the crop sheet frames it, and only what the user confirms
 * is written to documents. Every path out of the flow discards the candidate,
 * including the successful one: it has served its purpose the moment the crop
 * is written, and holding on to it only delays the system reclaiming it.
 */
export function usePlaylistCover(playlistId: number): PlaylistCover {
  const { t } = useTranslation();

  const [choosing, setChoosing] = useState(false);
  const [cropping, setCropping] = useState<CoverSource | null>(null);

  const open = useCallback(() => setChoosing(true), []);
  const close = useCallback(() => setChoosing(false), []);

  /*
   * The sheet closes before the picker opens. A modal still up while the system
   * picker arrives leaves two stacked when the user comes back, and the one
   * underneath is the one that takes the next tap.
   */
  const pick = useCallback(() => {
    setChoosing(false);
    void (async () => {
      const { source, error } = await pickCoverSource();
      if (error !== null) {
        showToast(t(`playlists.cover.${error === 'too-large' ? 'tooLarge' : 'unreadable'}`));
        return;
      }
      if (source !== null) setCropping(source);
    })();
  }, [t]);

  const cancelCrop = useCallback(() => {
    setCropping((current) => {
      discardCoverSource(current?.uri);
      return null;
    });
  }, []);

  const confirmCrop = useCallback(
    (rect: CropRect) => {
      const source = cropping;
      setCropping(null);
      if (!source) return;

      void (async () => {
        const { path, error } = await cropCoverTo(playlistId, source, rect);
        discardCoverSource(source.uri);

        if (error !== null) {
          showToast(t('playlists.cover.unreadable'));
          return;
        }
        if (path !== null) await setPlaylistCover(playlistId, path);
      })();
    },
    [cropping, playlistId, t],
  );

  const clear = useCallback(() => {
    setChoosing(false);
    void setPlaylistCover(playlistId, null);
  }, [playlistId]);

  return { choosing, open, close, cropping, pick, cancelCrop, confirmCrop, clear };
}
