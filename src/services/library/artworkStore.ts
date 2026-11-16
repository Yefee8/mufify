import { Directory, File, Paths } from 'expo-file-system';

import { listStrayArtworkPaths, relinkArtwork } from '@/db/queries/artwork';

import { planRelocation } from './artworkHome';

/**
 * Where extracted covers live: the app's files directory, not its cache.
 *
 * The cache is emptied by the system when the phone runs low on space, and a
 * cover written there is lost for good — see `artworkHome.ts` for why nothing
 * brought them back.
 */
export function artworkDirectory(): string {
  const directory = new Directory(Paths.document, 'artwork');
  if (!directory.exists) directory.create({ intermediates: true });
  return bare(directory.uri);
}

/**
 * Move covers written by earlier versions into the files directory, once.
 *
 * Every launch asks the database for paths outside it; after the first run
 * there are none, and this is one cheap query. A cover the system already
 * deleted is not recoverable here — its row is sent back through the scan
 * instead, which reads the file again and writes a fresh one.
 *
 * Moves first, database second: a row pointing at a file that has moved is a
 * blank cover until the next launch finishes the job, while a row pointing at a
 * path whose file never arrived would be a blank cover for good.
 */
export async function relocateArtwork(): Promise<{ moved: number; lost: number }> {
  const home = artworkDirectory();
  const stray = await listStrayArtworkPaths(home);
  if (stray.length === 0) return { moved: 0, lost: 0 };

  const plan = planRelocation(stray, home, (path) => new File(`file://${path}`).exists);
  const target = new Directory(`file://${home}`);

  let failed = 0;
  for (const [from, to] of plan.moves) {
    const source = new File(`file://${from}`);
    try {
      if (new File(`file://${to}`).exists) source.delete();
      else source.move(target);
    } catch {
      // Left where it is: still a valid path, and the next launch tries again.
      plan.moves.delete(from);
      failed += 1;
    }
  }

  await relinkArtwork(plan.moves, plan.lost);

  // Whatever is left in the old directory is referenced by no row — unless a
  // move failed, in which case a row still points into it.
  const old = new Directory(Paths.cache, 'artwork');
  if (failed === 0 && old.exists) {
    try {
      old.delete();
    } catch {
      // The cache is the system's to clear anyway.
    }
  }

  return { moved: plan.moves.size, lost: plan.lost.length };
}

function bare(uri: string): string {
  const path = uri.replace('file://', '');
  return path.endsWith('/') ? path.slice(0, -1) : path;
}
