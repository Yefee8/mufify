/**
 * Telling a cancelled folder picker apart from a broken one.
 *
 * These are opposite outcomes with opposite UI: a cancel should leave the
 * screen exactly as it was, a failure should say so and offer a retry. The
 * only thing distinguishing them is the rejection the picker throws, so the
 * check is worth stating precisely and testing rather than open-coding into a
 * `catch`.
 */

/**
 * Expo surfaces `PickerCancelledException` with this code. Codes are derived
 * from the Kotlin class name and are part of the module's contract, unlike the
 * human-readable message, which is prose and may be reworded or localised.
 */
const CANCELLED_CODE = 'ERR_PICKER_CANCELLED';

/*
 * The message check is a fallback for older module versions that reject
 * without a code. It is deliberately second: matching English prose is how
 * this breaks quietly, turning every cancel into an error banner.
 */
const CANCELLED_WORDS = ['cancel', 'dismiss'];

/** Whether this rejection means "the user backed out", not "something broke". */
export function isPickerDismissal(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;

  const code = (error as { code?: unknown }).code;
  if (typeof code === 'string' && code.toUpperCase() === CANCELLED_CODE) return true;

  const message = (error as { message?: unknown }).message;
  if (typeof message !== 'string') return false;

  const lowered = message.toLowerCase();
  return CANCELLED_WORDS.some((word) => lowered.includes(word));
}
