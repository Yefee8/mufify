import { Directory, File } from 'expo-file-system';

/**
 * One file in a hidden folder, inside a folder the user granted.
 *
 * `<folder>/.mufify/statistics.json`. The folder is one the user picked
 * through the system picker — for the library, or in Settings for this — so
 * the app holds a persistable grant to it, and the file lives on after the
 * app's own data is gone. The dot on the directory keeps it out of the media
 * scanner and out of other players' libraries.
 *
 * Everything here goes through the Storage Access Framework, which has two
 * things a filesystem path does not. A child cannot be *addressed*, only
 * *found*: the directory is listed and the entry with the right name is used,
 * because building a child URI by hand is provider-specific and the framework
 * silently resolves a wrong one to the tree's root. And a listing of a big
 * music folder is one query per child for the name, so the entry, once found,
 * is remembered for the life of the process.
 */

export const BACKUP_DIRECTORY = '.mufify';
export const BACKUP_FILE = 'statistics.json';
/** Playlist covers, one JPEG each, named by the playlist's identity. */
export const COVERS_DIRECTORY = 'covers';

/** The hidden directory's URI, by the folder it is in. */
const resolved = new Map<string, string>();

/** The last path segment of a document URI, decoded: `…%2F.mufify` → `.mufify`. */
function nameOf(entry: Directory | File): string {
  let uri = entry.uri;
  if (uri.endsWith('/')) uri = uri.slice(0, -1);
  let decoded: string;
  try {
    decoded = decodeURIComponent(uri);
  } catch {
    decoded = uri;
  }
  const slash = decoded.lastIndexOf('/');
  const colon = decoded.lastIndexOf(':');
  return decoded.slice(Math.max(slash, colon) + 1);
}

function findChild(parent: Directory, name: string): Directory | File | null {
  return parent.list().find((entry) => nameOf(entry) === name) ?? null;
}

function hiddenDirectory(folderUri: string, create: boolean): Directory | null {
  const remembered = resolved.get(folderUri);
  if (remembered) {
    const directory = new Directory(remembered);
    if (directory.exists) return directory;
    resolved.delete(folderUri);
  }

  const root = new Directory(folderUri);
  const found = findChild(root, BACKUP_DIRECTORY);
  let directory: Directory | null = found instanceof Directory ? found : null;
  if (directory === null && create) directory = root.createDirectory(BACKUP_DIRECTORY);
  if (directory !== null) resolved.set(folderUri, directory.uri);
  return directory;
}

/**
 * Write the file, replacing whatever was there.
 *
 * Deleted and recreated rather than overwritten: a provider's "w" mode is not
 * guaranteed to truncate, and a shorter file written over a longer one would
 * leave the old tail behind as unparseable JSON. The window between the two
 * is small, and the next scheduled write closes it.
 */
export function writeBackupFile(folderUri: string, text: string): void {
  const directory = hiddenDirectory(folderUri, true);
  if (directory === null) throw new Error('Backup directory could not be created');

  const existing = findChild(directory, BACKUP_FILE);
  if (existing instanceof File) existing.delete();

  const file = directory.createFile(BACKUP_FILE, 'application/json');
  file.write(text);
}

/** The file's text, or null when there is no file in this folder. */
export async function readBackupFile(folderUri: string): Promise<string | null> {
  const directory = hiddenDirectory(folderUri, false);
  if (directory === null) return null;

  const file = findChild(directory, BACKUP_FILE);
  if (!(file instanceof File)) return null;
  return file.text();
}

function coversDirectory(folderUri: string, create: boolean): Directory | null {
  const hidden = hiddenDirectory(folderUri, create);
  if (hidden === null) return null;
  const found = findChild(hidden, COVERS_DIRECTORY);
  if (found instanceof Directory) return found;
  return create ? hidden.createDirectory(COVERS_DIRECTORY) : null;
}

/**
 * Copy a cover into the backup folder under `name`, replacing any old one.
 *
 * Skipped when a file of that name is already there and the same size — a
 * cover is chosen once and rarely changes, and copying a hundred kilobytes
 * per playlist on every write would be most of the write.
 */
export async function writeCoverFile(folderUri: string, name: string, localPath: string): Promise<void> {
  const source = new File(`file://${localPath}`);
  if (!source.exists) return;
  const directory = coversDirectory(folderUri, true);
  if (directory === null) throw new Error('Covers directory could not be created');

  const existing = findChild(directory, name);
  if (existing instanceof File) {
    if (existing.size === source.size) return;
    existing.delete();
  }
  // Bytes through memory rather than `copy`: a cover is a few hundred
  // kilobytes at most, and the copy strategy wants to name the child after
  // the source, which is the playlist's *current* id — not an identity.
  const target = directory.createFile(name, 'image/jpeg');
  target.write(await source.bytes());
}

/** Copy a cover out of the backup folder to `localUri`; false if it is not there. */
export async function readCoverFile(folderUri: string, name: string, localUri: string): Promise<boolean> {
  const directory = coversDirectory(folderUri, false);
  if (directory === null) return false;
  const source = findChild(directory, name);
  if (!(source instanceof File)) return false;
  const target = new File(localUri);
  if (target.exists) target.delete();
  target.write(await source.bytes());
  return true;
}
