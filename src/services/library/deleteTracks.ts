import AudioTags, { type AudioDeleteResult } from 'audio-tags';

/**
 * Removing music from the device.
 *
 * The app never deletes anything on its own authority. Under scoped storage it
 * cannot — these files belong to whoever put them there, not to this app — and
 * it should not want to: the confirmation is drawn by the system, which can
 * name the files and cannot be impersonated by an app's own dialog. All this
 * module does is hand the platform a list and interpret the answer.
 *
 * Split from the native call so the interpretation is testable, because the
 * interesting part is not the delete: it is what the app is allowed to forget
 * afterwards, and getting *that* wrong loses a user's listening history.
 */

/** What a request came back as, in the terms a screen needs. */
export interface DeleteOutcome {
  /** Files gone from the device. Their rows have been retired. */
  deleted: number;
  /** The user declined. Nothing happened, and nothing should be said about it. */
  denied: number;
  /** The platform would not: too old to ask, or the file was already gone. */
  failed: number;
}

export interface DeletableTrack {
  id: number;
  fileUri: string;
}

/** Whether this device can delete at all. False below Android 10. */
export function canDeleteFiles(): boolean {
  return AudioTags.canDeleteAudioFiles();
}

/**
 * Ask the system to delete these files, and report what it did.
 *
 * `retire` is passed in rather than imported so this module stays free of the
 * database — and so the ordering below is visible in one place: **rows are
 * retired only for URIs the platform said were deleted.** A blanket retire on
 * "the request came back" would hide a track the user still has, which is the
 * worse of the two failures: a leftover row is fixed by the next scan, an
 * invisible file is not fixed by anything the user can find.
 */
export async function deleteTracks(
  tracks: readonly DeletableTrack[],
  retire: (ids: readonly number[]) => Promise<void>,
): Promise<DeleteOutcome> {
  if (tracks.length === 0) return { deleted: 0, denied: 0, failed: 0 };

  const result = await AudioTags.deleteAudioFiles(tracks.map((track) => track.fileUri));
  const retired = idsFor(tracks, result.deleted);

  await retire(retired);

  return {
    deleted: retired.length,
    denied: result.denied.length,
    failed: result.failed.length,
  };
}

/**
 * The ids behind the URIs the platform reported.
 *
 * Matched rather than assumed positional: API 30's single request answers for
 * the whole list at once and API 29's answers one at a time, so the order and
 * length of what comes back is not something to rely on.
 */
function idsFor(tracks: readonly DeletableTrack[], uris: readonly string[]): number[] {
  const byUri = new Map(tracks.map((track) => [track.fileUri, track.id]));
  return uris.flatMap((uri) => {
    const id = byUri.get(uri);
    return id === undefined ? [] : [id];
  });
}

/** Re-exported so callers need not reach into the native module's types. */
export type { AudioDeleteResult };
