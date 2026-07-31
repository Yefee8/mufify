import AudioTags from 'audio-tags';
import { Directory, Paths } from 'expo-file-system';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  addScanFolder,
  listScanFolders,
  listUnenrichedUris,
  saveEnriched,
  saveEnumerated,
} from '@/db/queries/scanning';
import { PRIMARY_VOLUME_ROOT, treeUriToPath } from '@/services/scanner/treeUri';
import {
  DEFAULT_SCAN_OPTIONS,
  enrichLibrary,
  enumerateLibrary,
  type ScanProgress,
  type ScannerPorts,
} from '@/services/scanner/scanner';

const IDLE: ScanProgress = { phase: 'idle', total: 0, processed: 0 };

/** Where music lands by default, and so always worth re-indexing. */
const DEFAULT_MUSIC_PATH = `${PRIMARY_VOLUME_ROOT}/Music`;

/** Where extracted artwork lives. Cache, not documents — it is rebuildable. */
function artworkDirectory(): string {
  const directory = new Directory(Paths.cache, 'artwork');
  if (!directory.exists) directory.create({ intermediates: true });
  return directory.uri.replace('file://', '');
}

export interface UseScanResult {
  progress: ScanProgress;
  /** True while either stage is running. */
  isScanning: boolean;
  /** MediaStore sweep. Safe to call on every launch. */
  scanLibrary: () => Promise<void>;
  /** Opens the system folder picker, then scans what was chosen. */
  addFolder: () => Promise<void>;
  /**
   * Re-index the known folders and sweep again. This is the pull-to-refresh
   * path: a user who has just copied files in should not have to restart the
   * app, or wait for the system scanner to notice on its own.
   */
  rescan: () => Promise<void>;
  cancel: () => void;
}

/**
 * Drives the two-stage scan and exposes its progress.
 *
 * Both entry points — the automatic MediaStore sweep and the manual folder
 * pick — go through the same pipeline. Manual adding is a first-class way to
 * fill the library, not a fallback for when the automatic scan disappoints:
 * MediaStore does not index files the system scanner has not seen, folders
 * with a `.nomedia`, or some SD card layouts, and this audience keeps music
 * in exactly those places.
 */
export function useScan(): UseScanResult {
  const [progress, setProgress] = useState<ScanProgress>(IDLE);
  const cancelled = useRef(false);

  const ports: ScannerPorts = useMemo(
    () => ({
      countAudioFiles: (minDurationMs) => AudioTags.countAudioFiles(minDurationMs),
      queryAudioFiles: (options) => AudioTags.queryAudioFiles(options),
      readTags: (uris, options) => AudioTags.readTags(uris, options),
      saveEnumerated,
      saveEnriched,
      listUnenrichedUris,
      // Hand the frame back between batches so scrolling never stutters.
      // `requestIdleCallback` rather than InteractionManager, which RN 0.86
      // deprecates and warns about at runtime.
      yieldToUi: () =>
        new Promise<void>((resolve) => {
          requestIdleCallback(() => resolve(), { timeout: 250 });
        }),
    }),
    [],
  );

  const run = useCallback(async () => {
    cancelled.current = false;
    const controller = { isCancelled: () => cancelled.current };
    const options = { ...DEFAULT_SCAN_OPTIONS, artworkDirectory: artworkDirectory() };

    const enumerated = await enumerateLibrary(ports, options, setProgress, controller);
    if (enumerated.phase !== 'done') return;

    await enrichLibrary(ports, options, setProgress, controller);
  }, [ports]);

  const scanLibrary = useCallback(async () => {
    const granted = await AudioTags.hasAudioPermission();
    if (!granted) {
      setProgress({ phase: 'failed', total: 0, processed: 0, error: 'permission-denied' });
      return;
    }
    await run();
  }, [run]);

  const addFolder = useCallback(async () => {
    try {
      const directory = await Directory.pickDirectoryAsync();
      await addScanFolder(directory.uri);

      // Index the folder rather than walking it — see ADR 007. A tree walk
      // would put SAF document URIs in `tracks.file_uri` alongside MediaStore
      // ones, and every consumer would then have to know which it was holding.
      await requestMediaScanFor(directory.uri);

      await run();
    } catch (error) {
      // A cancelled picker is not a failure — the user simply changed their
      // mind, and the screen should look exactly as it did before.
      if (isPickerDismissal(error)) return;
      setProgress({
        phase: 'failed',
        total: 0,
        processed: 0,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }, [run]);

  const rescan = useCallback(async () => {
    const granted = await AudioTags.hasAudioPermission();
    if (!granted) {
      setProgress({ phase: 'failed', total: 0, processed: 0, error: 'permission-denied' });
      return;
    }

    // Re-index first, then sweep. Without the re-index a file copied a minute
    // ago is still invisible to MediaStore and the sweep would find nothing,
    // which reads as "the app is broken" rather than "Android has not looked
    // yet". See ADR 007.
    const folders = await listScanFolders();
    const paths = folders
      .map((folder) => treeUriToPath(folder.uri))
      .filter((path): path is string => path !== null);

    // Always re-index the standard music location, whether or not it was
    // explicitly added — it is where files land by default.
    const targets = [...new Set([...paths, DEFAULT_MUSIC_PATH])];

    try {
      await AudioTags.requestMediaScan(targets);
    } catch {
      // Best-effort. The sweep below still runs on whatever is indexed.
    }

    await run();
  }, [run]);

  const cancel = useCallback(() => {
    cancelled.current = true;
  }, []);

  /*
   * The automatic sweep. Starts itself once per app session, behind the first
   * paint, so the user never waits on it — and because the scan is
   * incremental, an unchanged library costs one MediaStore count and nothing
   * else. A missing permission is not surfaced here: the automatic path stays
   * quiet and the empty state does the asking.
   */
  const swept = useRef(false);
  useEffect(() => {
    if (swept.current) return;
    swept.current = true;

    const handle = requestIdleCallback(
      () => {
        void AudioTags.hasAudioPermission().then((granted) => {
          if (granted) void run();
        });
      },
      { timeout: 1_000 },
    );

    return () => cancelIdleCallback(handle);
  }, [run]);

  return {
    progress,
    isScanning: progress.phase === 'enumerating' || progress.phase === 'enriching',
    scanLibrary,
    addFolder,
    rescan,
    cancel,
  };
}

/**
 * Point the system scanner at a picked folder.
 *
 * The picker hands back a SAF tree URI, which the scanner cannot take — it
 * wants filesystem paths. The common shapes are convertible; the ones that are
 * not simply fall through, and the user still gets the normal MediaStore
 * sweep rather than an error about something they cannot fix.
 */
async function requestMediaScanFor(treeUri: string): Promise<void> {
  const path = treeUriToPath(treeUri);
  if (!path) return;

  try {
    await AudioTags.requestMediaScan([path]);
  } catch {
    // Indexing is best-effort; the sweep below still runs.
  }
}

function isPickerDismissal(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  return message.includes('cancel') || message.includes('dismiss');
}
