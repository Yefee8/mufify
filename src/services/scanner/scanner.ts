import type { MediaStoreTrack, TrackTags } from 'audio-tags';

import { fromMediaStore, fromTags, type EnrichedFields, type ScannedTrack } from './trackMapping';

/**
 * The two-stage scan.
 *
 * Stage one enumerates everything MediaStore already knows in pages and writes
 * it straight down, so the library is usable within a second or two. Stage two
 * opens files in the background to fill in tags, the spec strip and artwork.
 *
 * Every dependency is injected. That is not ceremony — it is what lets the
 * whole pipeline, including cancellation and the failure paths, be tested
 * without a device.
 */

export type ScanPhase = 'idle' | 'enumerating' | 'enriching' | 'done' | 'cancelled' | 'failed';

export interface ScanProgress {
  phase: ScanPhase;
  /** Files discovered. Zero until the first count returns. */
  total: number;
  /** Files written in the current stage. */
  processed: number;
  /** Present only when `phase` is 'failed'. */
  error?: string;
}

export interface ScanOptions {
  /** Ignore anything shorter than this. The "ignore short files" setting. */
  minDurationMs: number;
  /** Rows per MediaStore page. */
  enumerateBatchSize: number;
  /** Files opened per enrich batch. */
  enrichBatchSize: number;
  artworkDirectory: string;
  /**
   * Index only files under this filesystem path, or the whole volume when null.
   *
   * Set by a folder import. A scoped sweep **never retires**: it has not looked
   * at the rest of the library, so it has no business declaring any of it
   * missing — and doing so would mark every track outside the imported folder
   * as gone, taking the library down to one folder in a single tap.
   */
  pathPrefix?: string | null;
}

export const DEFAULT_SCAN_OPTIONS: ScanOptions = {
  minDurationMs: 5_000,
  pathPrefix: null,
  // Big enough that paging is not the bottleneck, small enough that the first
  // rows land almost immediately.
  enumerateBatchSize: 500,
  // Opening files is expensive; a small batch keeps cancellation responsive.
  enrichBatchSize: 25,
  artworkDirectory: '',
};

export interface ScannerPorts {
  countAudioFiles(minDurationMs: number, pathPrefix?: string | null): Promise<number>;
  queryAudioFiles(options: {
    limit: number;
    offset: number;
    minDurationMs?: number;
    pathPrefix?: string | null;
  }): Promise<MediaStoreTrack[]>;
  readTags(uris: string[], options: { artworkDirectory: string }): Promise<TrackTags[]>;

  /** Batched insert-or-update, keyed on file URI. */
  saveEnumerated(rows: ScannedTrack[]): Promise<void>;
  saveEnriched(rows: { fileUri: string; fields: EnrichedFields }[]): Promise<void>;
  /** URIs that stage two has not reached yet. */
  listUnenrichedUris(limit: number): Promise<string[]>;

  /**
   * How many rows stage two still has to open.
   *
   * Asked once, at the start of the stage, so the progress bar has a
   * denominator. Without it stage two reported `total` as however many it had
   * already done, which makes the ratio permanently 1 and the bar permanently
   * full — a progress bar that is always finished is worse than none.
   */
  countUnenriched(): Promise<number>;

  /**
   * Mark every present track the sweep did not see as missing.
   *
   * Called only after a *complete* enumeration. A cancelled or failed sweep
   * has not seen the whole library, and acting on its partial result would
   * retire most of it.
   */
  retireUnseen(seenFileUris: string[]): Promise<void>;

  /** Hand the frame back so scrolling never stutters mid-scan. */
  yieldToUi(): Promise<void>;
}

export interface ScanController {
  isCancelled(): boolean;
}

const NEVER_CANCELLED: ScanController = { isCancelled: () => false };

/**
 * Stage one. Returns as soon as MediaStore is exhausted; the caller is
 * expected to start stage two after the first paint.
 */
export async function enumerateLibrary(
  ports: ScannerPorts,
  options: ScanOptions,
  onProgress: (progress: ScanProgress) => void,
  controller: ScanController = NEVER_CANCELLED,
): Promise<ScanProgress> {
  let progress: ScanProgress = { phase: 'enumerating', total: 0, processed: 0 };
  onProgress(progress);

  try {
    const total = await ports.countAudioFiles(options.minDurationMs, options.pathPrefix);
    progress = { ...progress, total };
    onProgress(progress);

    // Every URI this sweep saw, so the rows it did not see can be retired.
    const seen: string[] = [];

    let offset = 0;
    for (;;) {
      if (controller.isCancelled()) return finish(progress, 'cancelled', onProgress);

      const page = await ports.queryAudioFiles({
        limit: options.enumerateBatchSize,
        offset,
        minDurationMs: options.minDurationMs,
        pathPrefix: options.pathPrefix,
      });
      if (page.length === 0) break;

      const rows = page.map(fromMediaStore);
      for (const row of rows) seen.push(row.fileUri);
      await ports.saveEnumerated(rows);

      offset += page.length;
      progress = { ...progress, processed: offset };
      onProgress(progress);

      await ports.yieldToUi();

      // A short final page means the cursor is exhausted; asking again would
      // cost a query to learn nothing.
      if (page.length < options.enumerateBatchSize) break;
    }

    /*
     * Only now, and only when the whole library was in scope. A track whose
     * file is gone — or which no longer qualifies as music, since MIUI files
     * call recordings as songs and those are excluded by folder now — is
     * marked, never deleted. Deleting would take playlist entries and play
     * history with it, and an unmounted SD card would read as a library wipe.
     *
     * A folder import saw one folder. Retiring on that basis would mark every
     * track outside it as missing, which is the library disappearing because
     * somebody added to it.
     */
    if (options.pathPrefix == null) await ports.retireUnseen(seen);

    return finish({ ...progress, total: Math.max(progress.total, offset) }, 'done', onProgress);
  } catch (error) {
    return fail(progress, error, onProgress);
  }
}

/**
 * Stage two. Opens files in small batches, writing each batch before starting
 * the next so a cancelled or crashed scan keeps everything it already did.
 */
export async function enrichLibrary(
  ports: ScannerPorts,
  options: ScanOptions,
  onProgress: (progress: ScanProgress) => void,
  controller: ScanController = NEVER_CANCELLED,
): Promise<ScanProgress> {
  let progress: ScanProgress = { phase: 'enriching', total: 0, processed: 0 };

  try {
    /*
     * Counted before the first report, not after. Rows only leave the queue as
     * this stage writes them, so the denominator is fixed from here and the bar
     * fills honestly — and emitting once beforehand would have put a single
     * frame of "0 / 0" on screen, which is the bug this exists to fix.
     */
    progress = { ...progress, total: await ports.countUnenriched() };
    onProgress(progress);

    let processed = 0;

    for (;;) {
      if (controller.isCancelled()) return finish(progress, 'cancelled', onProgress);

      const uris = await ports.listUnenrichedUris(options.enrichBatchSize);
      if (uris.length === 0) break;

      const tags = await ports.readTags(uris, {
        artworkDirectory: options.artworkDirectory,
      });

      const rows = tags.flatMap((tag) => {
        const fields = fromTags(tag);
        // A file that would not open is skipped, not retried forever — it
        // still counts as processed so the progress bar can finish.
        return fields ? [{ fileUri: tag.uri, fields }] : [];
      });

      await ports.saveEnriched(rows);

      processed += uris.length;
      // `total` can be beaten by reality: a file that would not open is still
      // counted as processed, and a scan resumed after a crash starts partway.
      // Never report more done than there is to do.
      progress = { ...progress, processed, total: Math.max(progress.total, processed) };
      onProgress(progress);

      await ports.yieldToUi();
    }

    return finish({ ...progress, processed }, 'done', onProgress);
  } catch (error) {
    return fail(progress, error, onProgress);
  }
}

function finish(
  progress: ScanProgress,
  phase: ScanPhase,
  onProgress: (progress: ScanProgress) => void,
): ScanProgress {
  const next: ScanProgress = { ...progress, phase };
  onProgress(next);
  return next;
}

function fail(
  progress: ScanProgress,
  error: unknown,
  onProgress: (progress: ScanProgress) => void,
): ScanProgress {
  const message = error instanceof Error ? error.message : String(error);
  const next: ScanProgress = { ...progress, phase: 'failed', error: message };
  onProgress(next);
  return next;
}
