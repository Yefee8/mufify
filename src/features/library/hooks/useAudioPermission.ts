import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';

import {
  getAudioPermissionState,
  isDenied,
  refreshAudioPermission,
  requestAudioPermission,
  subscribeAudioPermission,
  type AudioPermissionState,
} from '@/services/scanner/audioPermission';

export interface UseAudioPermissionResult {
  state: AudioPermissionState;
  /** True only for a refusal that has actually been given. */
  denied: boolean;
  /** Denied permanently: asking again does nothing, system settings is the way. */
  blocked: boolean;
  /** Show the system dialog again. Resolves with what the user chose. */
  request: () => Promise<AudioPermissionState>;
}

/**
 * The audio permission, live.
 *
 * Subscribes to the shared store rather than holding a copy, so a grant given
 * on the Settings screen clears the warning on the Library screen without
 * either of them knowing about the other.
 *
 * **Re-reads whenever the app returns to the foreground**, which is the whole
 * reason this is a hook and not a one-shot call. The way out of a permanent
 * denial is the system settings page — the user leaves, flips the switch and
 * comes back — and without this the app would still be showing the warning it
 * had when they left, with a button sending them somewhere they have already
 * been. Android can also revoke the permission on its own for an app that has
 * gone unused, which arrives the same way: as a state change nobody in the app
 * caused.
 */
export function useAudioPermission(): UseAudioPermissionResult {
  const [state, setState] = useState<AudioPermissionState>(getAudioPermissionState);

  useEffect(() => subscribeAudioPermission(setState), []);

  useEffect(() => {
    void refreshAudioPermission();

    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') void refreshAudioPermission();
    });
    return () => subscription.remove();
  }, []);

  const request = useCallback(() => requestAudioPermission(), []);

  return { state, denied: isDenied(state), blocked: state === 'blocked', request };
}
