import AudioTags from 'audio-tags';

import { getAudioPermissionAsked, setAudioPermissionAsked } from '@/services/settings';

import { permissionErrorFor } from './permission';

/**
 * What the app is currently allowed to read, held in one place.
 *
 * A module-level store rather than per-hook state, because two screens ask the
 * same question and one of them can change the answer: the sweep lives in
 * Settings and the folder picker in the Library, so granting from one has to
 * clear the warning on the other. `equalizerController` holds device
 * capabilities the same way and for the same reason.
 *
 * The distinction that matters is between the two refusals. An ordinary denial
 * can be asked about again; a permanent one cannot — the system silently drops
 * the request — so a Retry button there is a control that does nothing, and
 * the only way forward is the app's page in system settings.
 */
export type AudioPermissionState = 'unknown' | 'granted' | 'denied' | 'blocked';

let state: AudioPermissionState = 'unknown';
const listeners = new Set<(state: AudioPermissionState) => void>();

function set(next: AudioPermissionState): void {
  if (next === state) return;
  state = next;
  for (const listener of listeners) listener(state);
}

export function getAudioPermissionState(): AudioPermissionState {
  return state;
}

export function subscribeAudioPermission(
  listener: (state: AudioPermissionState) => void,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Re-read the grant without prompting.
 *
 * Called on launch and every time the app comes back to the foreground, which
 * is the only way to notice the two changes Android can make behind the app's
 * back: the user flipping the switch in system settings, and Android revoking
 * the permission itself after the app has gone unused for a few months.
 *
 * A refusal is never *upgraded* here. `hasAudioPermission` answers granted or
 * not and cannot tell the two denials apart, so a known `blocked` would come
 * back as `denied` on the next foreground and the app would start offering a
 * Retry button that the system ignores. Only an actual request can move that
 * distinction, in either direction.
 */
export async function refreshAudioPermission(): Promise<AudioPermissionState> {
  const granted = await AudioTags.hasAudioPermission();
  if (granted) {
    set('granted');
  } else if (state === 'granted' || state === 'unknown') {
    set(getAudioPermissionAsked() ? 'denied' : 'unknown');
  }
  return state;
}

/**
 * Show the system dialog, and remember that it was shown.
 *
 * The "asked" flag is persisted because a first launch must not accuse anyone
 * of anything: before the question has been put, "not granted" means *not yet
 * asked*, and the library's empty state already says what to do. The warning
 * is for a permission that was refused, which is a different situation and
 * needs a different sentence.
 */
export async function requestAudioPermission(): Promise<AudioPermissionState> {
  setAudioPermissionAsked(true);

  const error = permissionErrorFor(await AudioTags.requestAudioPermission());
  set(error === null ? 'granted' : error === 'permission-blocked' ? 'blocked' : 'denied');
  return state;
}

/** Whether a refusal is worth putting on screen. */
export function isDenied(state: AudioPermissionState): boolean {
  return state === 'denied' || state === 'blocked';
}
