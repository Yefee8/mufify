/**
 * Where a cover's file should live, and what to do with one that is elsewhere.
 *
 * Extracted artwork used to be written to the app's cache directory, on the
 * reasoning that it can be rebuilt. Android does empty an app's cache when the
 * phone runs low on space — and nothing rebuilt it: the rows still pointed at
 * the old paths, and a rescan skips every file that has not changed, so the
 * covers were simply gone until the music itself changed. It lives in the
 * app's own files directory now, which the system never touches.
 *
 * Pure: the caller says which old paths still have a file behind them, and
 * gets back the moves to make and the rows to send back through the scan.
 */

export interface RelocationPlan {
  /** Old path → new path, for each file that exists and should be moved. */
  moves: Map<string, string>;
  /**
   * Paths whose file is gone. Their rows lose the path and are marked for the
   * next scan to read again, which writes a fresh cover where it belongs.
   */
  lost: string[];
}

/** The file's name, without the directory. Paths are POSIX on Android. */
export function fileNameOf(path: string): string {
  const slash = path.lastIndexOf('/');
  return slash === -1 ? path : path.slice(slash + 1);
}

/** `dir` with exactly one trailing slash, so prefix checks cannot match a sibling. */
function asDirectory(dir: string): string {
  return dir.endsWith('/') ? dir : `${dir}/`;
}

/**
 * What to do with every stored cover path that is not already at home.
 *
 * `exists` answers for an old path; it is asked once per distinct path, which
 * is roughly one per album — covers are content-addressed, so an album's
 * tracks share one file.
 */
export function planRelocation(
  paths: readonly string[],
  home: string,
  exists: (path: string) => boolean,
): RelocationPlan {
  const target = asDirectory(home);
  const moves = new Map<string, string>();
  const lost: string[] = [];

  for (const path of new Set(paths)) {
    if (path.startsWith(target)) continue;
    if (exists(path)) moves.set(path, target + fileNameOf(path));
    else lost.push(path);
  }

  return { moves, lost };
}
