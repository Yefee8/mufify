import { Directory, File, Paths } from 'expo-file-system';

/**
 * Covers a user chose for their playlists.
 *
 * **In documents, not the cache**, which is the one decision here worth
 * arguing about. Album art lives in the cache because it is rebuildable — the
 * file it came from is still on the phone, and a rescan puts it back. A picture
 * somebody picked for a playlist is not: the original may be a photo they
 * later delete, and Android empties an app's cache whenever storage runs
 * short. A cover that vanishes on a full phone is a bug that only reproduces
 * on the devices least able to report it.
 *
 * The bytes are copied rather than the URI stored. The picker hands back a
 * persistable `content://` grant, which sounds like enough and is not: the
 * grant dies with the app's data, the provider behind it can be an app that
 * gets uninstalled, and everything in this codebase that draws artwork draws
 * `file://` + a stored path. One representation, one lifetime.
 */

/** A cover this size is a photograph nobody meant to use as a thumbnail. */
const MAX_COVER_BYTES = 12 * 1024 * 1024;

/** Extensions the picker can return that are worth keeping on the filename. */
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.heic', '.avif']);

function coversDirectory(): Directory {
  const directory = new Directory(Paths.document, 'playlist-covers');
  if (!directory.exists) directory.create({ intermediates: true });
  return directory;
}

/** Artwork is stored bare and rendered as `file://` + the path. */
function bare(uri: string): string {
  return uri.replace('file://', '');
}

export interface PickCoverResult {
  /** The stored path, bare. Null when the user backed out. */
  path: string | null;
  /** Set when the pick failed for a reason the user should hear about. */
  error: 'too-large' | 'unreadable' | null;
}

/**
 * Ask for an image and keep a copy of it.
 *
 * Uses the system document picker rather than an image-library dependency:
 * `ACTION_OPEN_DOCUMENT` filtered to `image/*` reaches the gallery, Files,
 * Drive and anything else that serves images, and it needs **no permission at
 * all** — which matters in an app whose whole claim is that it asks for as
 * little as possible.
 *
 * The new file is written under a fresh name every time rather than replacing
 * the old one in place. `expo-image` caches by URI, so overwriting a path
 * would keep showing the previous picture until the cache happened to evict
 * it — the classic "I changed it and nothing happened".
 */
export async function pickPlaylistCover(playlistId: number): Promise<PickCoverResult> {
  const picked = await File.pickFileAsync({ mimeTypes: ['image/*'] });
  if (picked.canceled) return { path: null, error: null };

  const source = picked.result;
  if (source.size > MAX_COVER_BYTES) return { path: null, error: 'too-large' };

  try {
    const target = new File(coversDirectory(), `${playlistId}-${Date.now()}${extensionOf(source)}`);
    target.create({ overwrite: true });
    target.write(await source.bytes());
    return { path: bare(target.uri), error: null };
  } catch {
    // A picker result that cannot be read is a provider problem — an unmounted
    // SD card, a cloud file that is not downloaded — and none of it is
    // something the user can act on beyond choosing a different picture.
    return { path: null, error: 'unreadable' };
  }
}

/**
 * Remove a cover file that nothing points at any more.
 *
 * Best-effort by design: the database row is the truth about what a playlist
 * shows, and a leftover file in documents is a few hundred kilobytes, while a
 * throw here would abort the write that actually matters.
 */
export function deleteCoverFile(path: string | null | undefined): void {
  if (!path) return;
  try {
    const file = new File(`file://${path}`);
    if (file.exists) file.delete();
  } catch {
    // Nothing to tell the user: the cover they asked to change has changed.
  }
}

/** The source's extension when it is a plausible image one, else `.img`. */
function extensionOf(source: File): string {
  const extension = source.extension.toLowerCase();
  return IMAGE_EXTENSIONS.has(extension) ? extension : '.img';
}
