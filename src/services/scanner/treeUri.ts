/**
 * SAF tree URIs, translated to the filesystem paths the media scanner takes.
 *
 * Pure and free of native imports so it is unit tested — the conversion is
 * full of string handling that is easy to get subtly wrong and impossible to
 * notice, because a bad path just means "nothing got indexed".
 */

/** The primary (built-in) volume's root on every modern Android device. */
export const PRIMARY_VOLUME_ROOT = '/storage/emulated/0';

/**
 * `content://com.android.externalstorage.documents/tree/primary%3AMusic`
 * becomes `/storage/emulated/0/Music`.
 *
 * A removable volume carries an opaque id instead of `primary` —
 * `tree/1A2B-3C4D%3AMusic` — and Android mounts those at `/storage/<id>`.
 * That is not a documented API, which is why this used to return null for
 * them; it is also where every device actually puts them, and returning null
 * meant **picking a folder on an SD card indexed nothing at all** and said
 * nothing about why. A path that is wrong on some unknown device finds no
 * files, which is exactly what null did, so the guess costs nothing and fixes
 * the common case.
 *
 * Still null for anything with no volume at all, which cannot be resolved by
 * guessing.
 */
export function treeUriToPath(treeUri: string): string | null {
  const encoded = treeUri.split('/tree/')[1];
  if (!encoded) return null;

  // A tree URI can carry a document segment too; only the tree part is ours.
  const treePart = encoded.split('/document/')[0];
  if (!treePart) return null;

  let decoded: string;
  try {
    decoded = decodeURIComponent(treePart);
  } catch {
    return null;
  }

  const separator = decoded.indexOf(':');
  if (separator === -1) return null;

  const volume = decoded.slice(0, separator);
  const relative = decoded.slice(separator + 1).replace(/^\/+|\/+$/gu, '');

  if (volume === '') return null;

  const root = volume === 'primary' ? PRIMARY_VOLUME_ROOT : `/storage/${volume}`;
  return relative ? `${root}/${relative}` : root;
}

/**
 * A folder name worth showing a person.
 *
 * `treeUriToPath` is for the media scanner and returns null for anything it
 * cannot resolve — SD cards and USB volumes carry an opaque id. A settings
 * list cannot do that: a row the user added has to render as *something*, or
 * the screen quietly loses folders it is supposed to be accounting for. So
 * this always produces a string, degrading from a real path to the volume-
 * qualified name to the raw URI.
 */
export function treeUriToLabel(treeUri: string): string {
  const encoded = treeUri.split('/tree/')[1];
  if (!encoded) return treeUri;

  const treePart = encoded.split('/document/')[0];
  if (!treePart) return treeUri;

  let decoded: string;
  try {
    decoded = decodeURIComponent(treePart);
  } catch {
    return treeUri;
  }

  const separator = decoded.indexOf(':');
  if (separator === -1) return decoded;

  const volume = decoded.slice(0, separator);
  const relative = decoded.slice(separator + 1).replace(/^\/+|\/+$/gu, '');

  // The internal volume is the unremarkable case, so it goes unlabelled; a
  // removable one is worth naming, because "which card was that on" is the
  // whole question the user is asking when they look at this list.
  if (volume === 'primary') return relative || 'Internal storage';
  return relative ? `${volume}: ${relative}` : volume;
}
