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
 * Returns null for anything that cannot be resolved — SD cards and USB volumes
 * carry an opaque volume id rather than `primary`, and there is no supported
 * way to turn that into a path. Callers treat null as "index nothing", not as
 * an error, because the user cannot act on it either way.
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

  if (volume !== 'primary') return null;

  return relative ? `${PRIMARY_VOLUME_ROOT}/${relative}` : PRIMARY_VOLUME_ROOT;
}
