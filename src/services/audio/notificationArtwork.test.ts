jest.mock('expo-file-system', () => ({ File: class {}, Paths: { cache: '' } }));

// eslint-disable-next-line import/first
import { decodeBase64 } from './notificationArtwork';

/**
 * The placeholder travels as base64 in the source. The decoder is the only
 * thing between that string and the bytes Android decodes, and a decoder off
 * by one bit produces a file that BitmapFactory quietly refuses — no cover,
 * no error, on every phone.
 */
describe('decodeBase64', () => {
  it('decodes the classic example', () => {
    expect(Array.from(decodeBase64('TWFu'))).toEqual([77, 97, 110]);
    expect(new TextDecoder().decode(decodeBase64('aGVsbG8gd29ybGQ='))).toBe('hello world');
  });

  it('handles both padding lengths', () => {
    expect(Array.from(decodeBase64('TWE='))).toEqual([77, 97]);
    expect(Array.from(decodeBase64('TQ=='))).toEqual([77]);
  });

  it('round-trips a PNG header', () => {
    // 89 50 4E 47 0D 0A 1A 0A — the eight bytes every PNG starts with.
    expect(Array.from(decodeBase64('iVBORw0KGgo='))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  });
});
