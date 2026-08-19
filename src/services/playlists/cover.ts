import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { Image } from 'react-native';

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
 *
 * Picking happens in two steps because a cover is square and a photograph is
 * not. The picked file lands in the **cache** first, where the crop sheet can
 * show it and the user can decide what part of it they meant; only what they
 * confirm is written to documents. A cancelled crop leaves nothing behind but
 * a cache file the system is free to reclaim.
 */

/** A cover this size is a photograph nobody meant to use as a thumbnail. */
const MAX_COVER_BYTES = 12 * 1024 * 1024;

/**
 * The longest edge a stored cover gets.
 *
 * It is drawn at a third of a phone's width at the largest, so anything past
 * this is disk and decode time for detail no screen will show. Cropping
 * already discards most of a photograph; this discards the rest of the excess.
 */
const MAX_COVER_PIXELS = 1024;

/** Extensions the picker can return that are worth keeping on the filename. */
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.heic', '.avif']);

function coversDirectory(): Directory {
  const directory = new Directory(Paths.document, 'playlist-covers');
  if (!directory.exists) directory.create({ intermediates: true });
  return directory;
}

/** Where a picked file waits while the user decides how to crop it. */
function sourceDirectory(): Directory {
  const directory = new Directory(Paths.cache, 'cover-sources');
  if (!directory.exists) directory.create({ intermediates: true });
  return directory;
}

/** Artwork is stored bare and rendered as `file://` + the path. */
function bare(uri: string): string {
  return uri.replace('file://', '');
}

export type CoverError = 'too-large' | 'unreadable';

/** A picked image, on local disk, with the dimensions the cropper needs. */
export interface CoverSource {
  /** A `file://` URI in the cache. Not yet anybody's cover. */
  uri: string;
  width: number;
  height: number;
}

export interface PickSourceResult {
  /** Null when the user backed out. */
  source: CoverSource | null;
  error: CoverError | null;
}

/**
 * Ask for an image and put a local copy where the cropper can read it.
 *
 * Uses the system document picker rather than an image-library dependency:
 * `ACTION_OPEN_DOCUMENT` filtered to `image/*` reaches the gallery, Files,
 * Drive and anything else that serves images, and it needs **no permission at
 * all** — which matters in an app whose whole claim is that it asks for as
 * little as possible.
 *
 * The copy is what makes the rest work. The picker's `content://` URI is not
 * something `Image.getSize` or the manipulator can be relied on to open, and
 * the crop sheet needs the dimensions before it can draw anything.
 */
export async function pickCoverSource(): Promise<PickSourceResult> {
  const picked = await File.pickFileAsync({ mimeTypes: ['image/*'] });
  if (picked.canceled) return { source: null, error: null };

  const file = picked.result;
  if (file.size > MAX_COVER_BYTES) return { source: null, error: 'too-large' };

  try {
    const target = new File(sourceDirectory(), `${Date.now()}${extensionOf(file)}`);
    target.create({ overwrite: true });
    target.write(await file.bytes());

    const { width, height } = await measure(target.uri);
    if (width <= 0 || height <= 0) return { source: null, error: 'unreadable' };

    return { source: { uri: target.uri, width, height }, error: null };
  } catch {
    // A picker result that cannot be read is a provider problem — an unmounted
    // SD card, a cloud file that is not downloaded — and none of it is
    // something the user can act on beyond choosing a different picture.
    return { source: null, error: 'unreadable' };
  }
}

/** A square of the source image, in source pixels. */
export interface CropRect {
  originX: number;
  originY: number;
  size: number;
}

/**
 * Cut the chosen square out and keep it as this playlist's cover.
 *
 * Written under a fresh name every time rather than replacing the old one in
 * place. `expo-image` caches by URI, so overwriting a path would keep showing
 * the previous picture until the cache happened to evict it — the classic
 * "I changed it and nothing happened".
 *
 * JPEG, because a cover is a photograph and PNG would store it at several
 * times the size for detail a 1024px square cannot hold anyway.
 */
export async function cropCoverTo(
  playlistId: number,
  source: CoverSource,
  rect: CropRect,
): Promise<{ path: string | null; error: CoverError | null }> {
  try {
    const safe = clampRect(rect, source);
    const rendered = await ImageManipulator.manipulate(source.uri)
      .crop({ originX: safe.originX, originY: safe.originY, width: safe.size, height: safe.size })
      .resize({ width: Math.min(MAX_COVER_PIXELS, Math.round(safe.size)) })
      .renderAsync();

    const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.9 });

    // The manipulator writes to its own cache directory; the cover has to live
    // in documents, where Android will not reclaim it under storage pressure.
    const target = new File(coversDirectory(), `${playlistId}-${Date.now()}.jpg`);
    await new File(saved.uri).move(target);

    return { path: bare(target.uri), error: null };
  } catch {
    return { path: null, error: 'unreadable' };
  }
}

/**
 * Throw away a picked file the user did not go on to use.
 *
 * Best-effort: it is in the cache, so the system reclaims it either way. This
 * only means it goes now rather than eventually.
 */
export function discardCoverSource(uri: string | null | undefined): void {
  if (!uri) return;
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // Nothing to say and nothing the user could do about it.
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

/**
 * Keep a crop inside the image it came from.
 *
 * The sheet clamps as the finger moves, but it works in floats against a
 * measured layout and the manipulator throws on a rectangle that runs one pixel
 * past an edge. Rounding here rather than there means the failure cannot be a
 * rounding error.
 */
function clampRect(rect: CropRect, source: CoverSource): CropRect {
  const size = Math.max(1, Math.min(Math.round(rect.size), source.width, source.height));
  return {
    size,
    originX: Math.max(0, Math.min(Math.round(rect.originX), source.width - size)),
    originY: Math.max(0, Math.min(Math.round(rect.originY), source.height - size)),
  };
}

/** `Image.getSize` reads the header rather than decoding the whole file. */
function measure(uri: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    Image.getSize(
      uri,
      (width, height) => resolve({ width, height }),
      () => resolve({ width: 0, height: 0 }),
    );
  });
}

/** The source's extension when it is a plausible image one, else `.img`. */
function extensionOf(source: File): string {
  const extension = source.extension.toLowerCase();
  return IMAGE_EXTENSIONS.has(extension) ? extension : '.img';
}
