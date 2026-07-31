import { isPickerDismissal } from './pickerError';

/** The shape expo-modules gives a rejected AsyncFunction. */
function codedError(code: string, message: string): Error & { code: string } {
  return Object.assign(new Error(message), { code });
}

describe('isPickerDismissal', () => {
  it('recognises the code expo actually throws on cancel', () => {
    expect(
      isPickerDismissal(
        codedError('ERR_PICKER_CANCELLED', 'The file picker was cancelled by the user'),
      ),
    ).toBe(true);
  });

  it('recognises the cancel by code even if the message is reworded', () => {
    // The point of preferring the code: prose is not a contract. A localised
    // build or an upstream wording change must not turn a cancel into an
    // error banner.
    expect(isPickerDismissal(codedError('ERR_PICKER_CANCELLED', 'Seçim iptal edildi'))).toBe(true);
    expect(isPickerDismissal(codedError('ERR_PICKER_CANCELLED', ''))).toBe(true);
  });

  it('still recognises the message when no code is present', () => {
    expect(isPickerDismissal(new Error('The file picker was cancelled by the user'))).toBe(true);
    expect(isPickerDismissal(new Error('Picker dismissed'))).toBe(true);
  });

  it('treats a real failure as a failure', () => {
    expect(isPickerDismissal(codedError('ERR_FILESYSTEM', 'Permission denied'))).toBe(false);
    expect(isPickerDismissal(new Error('Activity not found'))).toBe(false);
  });

  it('does not throw on values that are not errors', () => {
    expect(isPickerDismissal(undefined)).toBe(false);
    expect(isPickerDismissal(null)).toBe(false);
    expect(isPickerDismissal('cancelled')).toBe(false);
    expect(isPickerDismissal({})).toBe(false);
  });

  it('does not mistake a message-less object for a cancel', () => {
    // The picker was observed rejecting with an effectively empty error; the
    // safe reading of "I cannot tell" is "not a cancel", so the user gets an
    // error state rather than silence.
    expect(isPickerDismissal({ message: undefined })).toBe(false);
  });
});
