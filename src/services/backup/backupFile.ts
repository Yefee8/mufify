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
