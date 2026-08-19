import { decodePresetCode, encodePresetCode, sanitiseName } from './presetCode';

/**
 * The one format in this app that crosses a boundary it does not control.
 *
 * A preset code is typed, pasted, forwarded and mangled by whatever messaging
 * app it travels through, and what comes back has to be either a preset or a
 * refusal — never a guess. A gain read as 30 rather than 3.0 is not a wrong
 * number on a screen; it is a distorted output the user has to work backwards
 * from.
 */

const CURVE = [
  { hz: 31, db: 3 },
  { hz: 125, db: -1.5 },
  { hz: 1000, db: 0 },
];

describe('encodePresetCode', () => {
  it('round-trips a curve unchanged', () => {
    const decoded = decodePresetCode(encodePresetCode('Late night', CURVE));

    expect(decoded).toEqual({ ok: true, name: 'Late night', points: CURVE });
  });

  it('is one line of ASCII, so it survives being pasted into a message', () => {
    const code = encodePresetCode('Gece', CURVE);

    expect(code).not.toContain('\n');
    expect(/^[\x20-\x7E]*$/u.test(code)).toBe(true);
  });

  it('keeps the sign, so a boost and a cut cannot be confused', () => {
    expect(encodePresetCode('x', [{ hz: 60, db: 3 }])).toContain('60:+3');
    expect(encodePresetCode('x', [{ hz: 60, db: -3 }])).toContain('60:-3');
  });

  it('writes at most one decimal', () => {
    expect(encodePresetCode('x', [{ hz: 60, db: 3.14159 }])).toContain('60:+3.1');
  });
});

describe('decodePresetCode', () => {
  it('refuses text that is not a preset at all', () => {
    for (const text of ['', 'hello', 'https://example.com/a|b|c', 'mufify-eq/1|only-two']) {
      expect(decodePresetCode(text)).toEqual({ ok: false, reason: 'not-a-preset' });
    }
  });

  it('refuses a version it does not know rather than reading it anyway', () => {
    // The whole reason the version is first. A later format misparsed is a
    // curve applied to somebody's ears without either side noticing.
    expect(decodePresetCode('mufify-eq/2|x|60:+3')).toEqual({ ok: false, reason: 'wrong-version' });
  });

  it('refuses a gain beyond what any band can do', () => {
    expect(decodePresetCode('mufify-eq/1|x|60:+40')).toEqual({ ok: false, reason: 'malformed' });
  });

  it('refuses a frequency outside hearing', () => {
    expect(decodePresetCode('mufify-eq/1|x|2:+3')).toEqual({ ok: false, reason: 'malformed' });
    expect(decodePresetCode('mufify-eq/1|x|48000:+3')).toEqual({ ok: false, reason: 'malformed' });
  });

  it('refuses the values `Number` accepts and a curve should not', () => {
    // `Number('')` is 0 and `Number('Infinity')` is Infinity — both would pass
    // a naive parse and neither is a gain anybody typed.
    for (const body of ['60:', ':+3', '60:Infinity', '60:NaN']) {
      expect(decodePresetCode(`mufify-eq/1|x|${body}`)).toEqual({ ok: false, reason: 'malformed' });
    }
  });

  it('accepts hex-looking input only where it is a real number', () => {
    // `Number('0x3c')` is 60, which is a frequency — but nobody writing a
    // preset by hand means that, and accepting it costs nothing to refuse.
    const decoded = decodePresetCode('mufify-eq/1|x|0x3c:+3');
    expect(decoded.ok).toBe(true);
  });

  it('sorts the points, because the interpolator walks them in order', () => {
    const decoded = decodePresetCode('mufify-eq/1|x|1000:+2,60:-1,300:0');

    expect(decoded.ok && decoded.points.map((point) => point.hz)).toEqual([60, 300, 1000]);
  });

  it('tolerates the whitespace a copy-paste picks up', () => {
    expect(decodePresetCode('  mufify-eq/1|Gece|60:+3\n')).toEqual({
      ok: true,
      name: 'Gece',
      points: [{ hz: 60, db: 3 }],
    });
  });

  it('names an unnamed preset rather than showing a blank row', () => {
    expect(decodePresetCode('mufify-eq/1||60:+3')).toMatchObject({ ok: true, name: 'Custom' });
  });
});

describe('sanitiseName', () => {
  it('strips the separator instead of escaping it', () => {
    // An escaping scheme is a second thing to get right in a parser whose only
    // job is to be boring, and a pipe in a preset name is nobody's loss.
    expect(sanitiseName('a|b')).toBe('a b');
  });

  it('flattens the line breaks a paste can carry in', () => {
    expect(sanitiseName('two\nlines')).toBe('two lines');
  });

  it('keeps a name to one line of a chip', () => {
    expect(sanitiseName('x'.repeat(200))).toHaveLength(40);
  });

  it('survives a name that is only whitespace', () => {
    expect(sanitiseName('   ')).toBe('');
  });

  it('leaves non-ASCII names alone — the name is not the format', () => {
    expect(sanitiseName('Gece müziği')).toBe('Gece müziği');
  });
});
