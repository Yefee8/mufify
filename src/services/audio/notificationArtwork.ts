import { Asset } from 'expo-asset';

import placeholderModule from '@/assets/images/notification-artwork.png';

/**
 * The cover Android shows when a track has none.
 *
 * Without it the system media notification drew no artwork at all while the
 * app drew its music-note placeholder — the same track looking like two
 * different things depending on which surface you were looking at. This is
 * that placeholder as a bitmap: lucide's `music` mark, at the same stroke
 * weight, on `--color-panel`, so the notification and the app agree.
 *
 * It has to reach expo-audio as a `file://` URL. The service loads artwork
 * with `java.net.URL(...).openConnection()`, which knows nothing about
 * `asset://` or a Metro URL, so the asset is unpacked to the cache directory
 * once and the resulting path is reused.
 *
 * Resolving it is asynchronous and binding the lock screen is not, so the URI
 * is prepared up front and read synchronously afterwards. A track that loads
 * before it lands simply has no placeholder for that moment; the next metadata
 * push carries it.
 */

let placeholderUri: string | null = null;
let preparing: Promise<string | null> | null = null;

/** Unpack the placeholder to a real file. Safe to call repeatedly. */
export function prepareNotificationArtwork(): Promise<string | null> {
  if (placeholderUri !== null) return Promise.resolve(placeholderUri);

  preparing ??= Asset.fromModule(placeholderModule)
    .downloadAsync()
    .then((asset) => {
      // `localUri` is a `file://` path once downloaded. Anything else — a
      // Metro URL that never resolved, say — is not something the notification
      // can load, so it is better to show nothing than to show a broken icon.
      placeholderUri = asset.localUri?.startsWith('file://') ? asset.localUri : null;
      return placeholderUri;
    })
    .catch(() => null);

  return preparing;
}

/**
 * What to hand the lock screen for this track: its own cover, or the
 * placeholder, or nothing if the placeholder is not ready yet.
 */
export function lockScreenArtworkUri(artworkPath: string | null): string | undefined {
  if (artworkPath !== null) return `file://${artworkPath}`;
  return placeholderUri ?? undefined;
}
