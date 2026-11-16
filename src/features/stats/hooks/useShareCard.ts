import * as Sharing from 'expo-sharing';
import { useCallback, useState, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import type { HostInstance } from 'react-native';
import { captureRef } from 'react-native-view-shot';

import { showToast } from '@/services/toast';

import { SHARE_CARD_HEIGHT, SHARE_CARD_WIDTH } from '../components/ShareCard';

/** The picture's size: a story's 1080×1920, whatever the phone's density. */
const OUTPUT_WIDTH = 1080;
const OUTPUT_HEIGHT = Math.round((OUTPUT_WIDTH * SHARE_CARD_HEIGHT) / SHARE_CARD_WIDTH);

export interface ShareCardState {
  /** True from the press until the system's share sheet has been handed the file. */
  sharing: boolean;
  share: () => void;
}

/**
 * Turn the card into a PNG and hand it to Android's share sheet.
 *
 * The share sheet is where Instagram, X and everything else the phone has
 * appear, chosen by the person holding it. Nothing here talks to a network:
 * the picture is written to the app's cache and offered through a content URI
 * the receiving app is granted for that one share. Mufify still has no
 * internet permission — see `docs/adr/041`.
 *
 * A failure says so in a toast and leaves the sheet open, so the person can
 * try again; a dismissed share sheet is not a failure.
 */
export function useShareCard(cardRef: RefObject<HostInstance | null>): ShareCardState {
  const { t } = useTranslation();
  const [sharing, setSharing] = useState(false);

  const share = useCallback(() => {
    if (sharing || cardRef.current === null) return;
    setSharing(true);
    void (async () => {
      try {
        const uri = await captureRef(cardRef.current, {
          format: 'png',
          result: 'tmpfile',
          width: OUTPUT_WIDTH,
          height: OUTPUT_HEIGHT,
          fileName: 'mufify-stats',
        });
        await Sharing.shareAsync(uri, {
          mimeType: 'image/png',
          dialogTitle: t('stats.share.dialogTitle'),
        });
      } catch {
        showToast(t('stats.share.failed'));
      } finally {
        setSharing(false);
      }
    })();
  }, [cardRef, sharing, t]);

  return { sharing, share };
}
