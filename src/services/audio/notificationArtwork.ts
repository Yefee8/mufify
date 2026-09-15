import { File, Paths } from 'expo-file-system';

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
 * `asset://`, a resource name or a Metro URL — so the bytes are written to the
 * cache directory once and that path is reused.
 *
 * **The bytes are here, in the source, not behind `require`.** They used to
 * be: `Asset.fromModule(require('notification-artwork.png')).downloadAsync()`,
 * which works under Metro and not in a release build. There, without
 * expo-updates, expo-asset has no URL for an embedded image — it resolves to
 * an empty string and the download fails — so no release ever showed the
 * placeholder. Three kilobytes of PNG in a string is the version that cannot
 * depend on how the bundler embedded a file.
 *
 * Regenerate after editing `assets/images/notification-artwork.png`:
 * `python3 -c "import base64;print(base64.b64encode(open('assets/images/notification-artwork.png','rb').read()).decode())"`
 *
 * Resolving it is asynchronous and binding the lock screen is not, so the URI
 * is prepared up front and read synchronously afterwards. A track that loads
 * before it lands simply has no placeholder for that moment; the next metadata
 * push carries it.
 */

const PLACEHOLDER_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAgAAAAIACAIAAAB7GkOtAAAMXUlEQVR42u3dP2sbSRjA4XyJK65IkcA1CbgwwY1xmoAq4zQm' +
  'uAgYFyYQCG6MXcXubHdKqfLcps0XvPcwCBHZsWZ2Z3d294GnyCmS/0yO9yfNrlYv/vr7NQAT9MISAAgAAAIAgAAAIAAACAAA' +
  'AgCAAAAgAAAIAAACAIAAACAAAAgAAAIAgAAAIAAACAAAAgCAAAAgAAAIAAACAIAAAAgAAAIAgAAAIAAACAAAAgCAAAAgAAAI' +
  'AAACAIAAACAAAAgAAAIAgAAAIAAACAAAAgCAAAAgAAAIAAACAIAAAAiAVQAQAAAEAAABAEAAABAAAAQAAAEAQAAAEAAABAAA' +
  'AQBAAAAQAAAEAAABAEAAABAAAAQAAAEAQAAAEAAABAAAAQAQAAAEAAABAEAAABAAAAQAAAEAQAAAEAAABAAAAQBAAAAQAAAE' +
  'AAABAEAAABAAAAQAAAEAQAAAEAAABAAAAQAQAKsAIAAACAAAAgCAAAAgAAAIAAACAIAAACAAAAgAAAIAgAAAIAAACAAAAgCA' +
  'AAAgAAAIAAACAIAAACAAAAgAAAIAIAAACAAAAgCAAAAgAAAIAAACAIAAACAAAAgAAAIAgAAAIAAACAAAAgCAAAAgAAAIAAAC' +
  'AIAAACAAAAgAAAIAIAAACAAAAgCAAAAgAAAIAAACAIAAACAAAAgAAAIAgAAAIAAACAAAAgCAAAAgAAAIAAACAIAAACAAAAgA' +
  'AAIAgAAACAAAAgCAAAAgAAAIAAACAIAAACAAAAgAAAIAgAAAIAAACAAAAgCAAAAgAAAIAAACANOztb33/sPHT5+/hoPDk/hP' +
  'a4IAwJjH/dnFzfXtYvHvr3WXV3MZQABg/OP+KbP9IwuIAMD4x/2jvA5AAGAS4/7RvSDrjADA+Me9FwEIAEx33K87ODzxz4EA' +
  'wPjH/br4qfwDIQAw/nEvAAgATHTcCwACABMd9wKAAMBEx70AIAAw0XEvAAgATHTcCwACgHH/CwFAABitl6/exnQz7gUAAWBa' +
  'dnZnPxY/JzXK7+b3l1fzGOiz/SMBQACY7vSf1LiP3/e3FRAABICJ7vyM77n/n8f9OgFAAJiig8OTqY17AUAA4H+DO+rbfNwL' +
  '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' +
  'VHduaOn3B8TXd8YnCACVauXyZ49e6cF7fUEAqF08Sf/0+WtbO0Ix+uOrWVUQAAb2aqDJplA81sFeEACGfWzg4PDk7OJmk9cE' +
  'cZ+4Z8z91cuFAgLAGHaHdnZnMd8/ff66Km6J2x3gBQEAQAAAEAAABAAAAQBAAAAQAAAEAAABAEAAABAAAAEAQAAAEAAABAAA' +
  'AQBAAAAQAAAEAAABAEAAABAAAAQAAAEAQAAAEAAABAAAAQBAAAAQAAAEAAABAEAAABAAAAEAQAAAEAAABAAAAQBAAAAQAAAE' +
  'AAABAEAAABAAAAQAAAEAQAAAEAAABAAAAQBAAAAQAAAEAAABAEAAABAAAAQAQAAAEAAABAAAAQBAAAAQAAAEAAABAEAAABAA' +
  'AAQAAAEAQAAAEAAABAAAAQBAAAAQAAAEAAABAEAAABAAAAQAQAAAEAAABAAAAQBAAAAQAAAEAAABAEAAABAAAAQAAAEAQAAA' +
  'EAAABAAAAQBAAAAQAAAEAAABAEAAABAAAAQAQAAsAYAAACAAAAgAAAIAgAAAIAAACAAAAgCAAAAgAAAIAAACAIAAACAAAAgA' +
  'AAIAgAAAIAAACAAAAgCAAAAgAAAIAIAAACAAAAgAAAIAgAAAIAAACAAAAgCAAAAgAAAIAAACAIAAACAAAAgAAAIAgAAAIAAA' +
  'CAAAAgCAAAAgAAAIAIAAWAUAAQBAAAAQAAAEAAABAEAAABAAAAQAAAEAQAAAEAAABAAAAQBAAAAQAAAEAAABAEAAABAAAAQA' +
  'AAEAQAAAEAAAAQBAAAAQAAAEAAABAEAAABAAAAQAgPr9B9q8u/BhP6aAAAAAAElFTkSuQmCC';

const PLACEHOLDER_FILE = 'notification-artwork.png';

let placeholderUri: string | null = null;
let preparing: Promise<string | null> | null = null;

/** Write the placeholder to a real file. Safe to call repeatedly. */
export function prepareNotificationArtwork(): Promise<string | null> {
  if (placeholderUri !== null) return Promise.resolve(placeholderUri);

  preparing ??= Promise.resolve()
    .then(() => {
      const file = new File(Paths.cache, PLACEHOLDER_FILE);
      // The cache can be emptied by the system at any time, so the size is
      // checked rather than mere existence: a truncated file is not a cover.
      const bytes = decodeBase64(PLACEHOLDER_PNG_BASE64);
      if (!file.exists || file.size !== bytes.length) file.write(bytes);
      placeholderUri = file.uri;
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

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Standard base64, no whitespace. Here because `atob` is not a given in Hermes. */
export function decodeBase64(text: string): Uint8Array {
  const clean = text.replace(/=+$/u, '');
  const bytes = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let buffer = 0;
  let bits = 0;
  let index = 0;
  for (const char of clean) {
    buffer = (buffer << 6) | ALPHABET.indexOf(char);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes[index++] = (buffer >> bits) & 0xff;
    }
  }
  return bytes;
}
