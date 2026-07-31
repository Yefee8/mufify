/**
 * Turning a permission answer into what the library screen should say.
 *
 * Pure and free of native imports so the branch is unit tested. It earns its
 * own module because getting it wrong is silent: without the audio permission
 * a MediaStore query does not throw, it returns only the rows this app itself
 * owns — none — so the scan "succeeds" with zero tracks and the library shows
 * its empty state. That is indistinguishable from having no music, which is
 * exactly how the manual-add flow came to look like it did nothing at all.
 */

import type { AudioPermissionResult } from 'audio-tags';

/**
 * The codes the library screen renders. Two denials, not one: a permanent
 * denial cannot be undone by asking again, so offering a retry there would
 * hand the user a button that silently does nothing.
 */
export type PermissionError = 'permission-denied' | 'permission-blocked';

/**
 * The scan-failure code for a permission answer, or null when the scan may
 * proceed.
 */
export function permissionErrorFor(result: AudioPermissionResult): PermissionError | null {
  if (result.granted) return null;
  return result.canAskAgain ? 'permission-denied' : 'permission-blocked';
}

/** Whether this error code is a permission problem rather than a scan failure. */
export function isPermissionError(error: string | undefined): boolean {
  return error === 'permission-denied' || error === 'permission-blocked';
}
