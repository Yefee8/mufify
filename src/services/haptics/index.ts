import * as Haptics from 'expo-haptics';

import { getHapticsEnabled } from '@/services/settings';

/**
 * Physical feedback, behind one door.
 *
 * The design direction asks for "physical-feeling controls", and on a phone
 * that means the taptic engine. Centralised for two reasons: the setting is
 * checked once rather than at every call site, and every call is fire-and-forget
 * — a failed vibration must never reject a promise that a transport control is
 * awaiting, which is how a missing native module turns a play button into a
 * dead one.
 *
 * Haptics are advisory. A device without a vibrator, or a user who has turned
 * the setting off, gets silence and no error.
 */

function fire(run: () => Promise<void>): void {
  if (!getHapticsEnabled()) return;
  void run().catch(() => {
    // Advisory by design: no vibrator, or the OS declined. Nothing to report.
  });
}

/** A discrete confirmation: play, pause or favourite. */
export function tapFeedback(): void {
  fire(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
}

/** Something has been picked up — a drag starting, a long-press landing. */
export function liftFeedback(): void {
  fire(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
}

/** A committed change: reorder dropped or track queued. */
export function commitFeedback(): void {
  fire(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
}

/** A refused action: swiping past the end or an empty action. */
export function rejectFeedback(): void {
  fire(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning));
}
