import { activeLineIndex, parseLyrics } from './parseLyrics';

describe('nothing worth showing', () => {
  it('is null for absent lyrics', () => {
    expect(parseLyrics(null)).toBeNull();
    expect(parseLyrics(undefined)).toBeNull();
  });

  it('is null for whitespace', () => {
    expect(parseLyrics('   \n\n  \n')).toBeNull();
  });

  it('is null for a file that carries only metadata', () => {
    expect(parseLyrics('[ar:Someone]\n[ti:A Song]\n[by:a tagger]')).toBeNull();
  });
});

describe('a plain lyric', () => {
  it('keeps its lines in order', () => {
    const lyrics = parseLyrics('First line\nSecond line\nThird line');
    expect(lyrics).toEqual({
      kind: 'plain',
      lines: ['First line', 'Second line', 'Third line'],
    });
  });

  it('keeps blank lines inside and drops them at the edges', () => {
    const lyrics = parseLyrics('\n\nVerse\n\nChorus\n\n');
    expect(lyrics).toEqual({ kind: 'plain', lines: ['Verse', '', 'Chorus'] });
  });

  it('accepts carriage returns and escaped newlines', () => {
    expect(parseLyrics('One\r\nTwo')).toEqual({ kind: 'plain', lines: ['One', 'Two'] });
    expect(parseLyrics('One\\nTwo')).toEqual({ kind: 'plain', lines: ['One', 'Two'] });
  });

  it('is not fooled into a sync by one stray stamp', () => {
    const lyrics = parseLyrics('[00:00.00]\nVerse one\nVerse two\nVerse three\nVerse four');
    expect(lyrics?.kind).toBe('plain');
  });
});

describe('a timed lyric', () => {
  it('reads minutes, seconds and hundredths', () => {
    const lyrics = parseLyrics('[00:12.50]Hello\n[01:05.00]Goodbye');
    expect(lyrics).toEqual({
      kind: 'timed',
      lines: [
        { atMs: 12_500, text: 'Hello' },
        { atMs: 65_000, text: 'Goodbye' },
      ],
    });
  });

  it('scales the fraction by its own width', () => {
    // ".5" is half a second and ".500" is too; ".05" is a twentieth.
    expect(parseLyrics('[00:01.5]a')).toEqual({ kind: 'timed', lines: [{ atMs: 1500, text: 'a' }] });
    expect(parseLyrics('[00:01.500]a')).toEqual({
      kind: 'timed',
      lines: [{ atMs: 1500, text: 'a' }],
    });
    expect(parseLyrics('[00:01.05]a')).toEqual({
      kind: 'timed',
      lines: [{ atMs: 1050, text: 'a' }],
    });
  });

  it('accepts a stamp with no fraction, and an hour', () => {
    expect(parseLyrics('[00:09]a\n[1:02:03]b')).toEqual({
      kind: 'timed',
      lines: [
        { atMs: 9000, text: 'a' },
        { atMs: 3_723_000, text: 'b' },
      ],
    });
  });

  it('gives every stamp on a repeated line its own entry', () => {
    const lyrics = parseLyrics('[00:10.00][00:40.00]Chorus\n[00:25.00]Verse');
    expect(lyrics).toEqual({
      kind: 'timed',
      lines: [
        { atMs: 10_000, text: 'Chorus' },
        { atMs: 25_000, text: 'Verse' },
        { atMs: 40_000, text: 'Chorus' },
      ],
    });
  });

  it('keeps the silent stretches, so the highlight can stop', () => {
    const lyrics = parseLyrics('[00:01.00]Sung\n[00:05.00]\n[00:09.00]Sung again');
    expect(lyrics).toEqual({
      kind: 'timed',
      lines: [
        { atMs: 1000, text: 'Sung' },
        { atMs: 5000, text: '' },
        { atMs: 9000, text: 'Sung again' },
      ],
    });
  });

  it('survives an untimed credit line among timed ones', () => {
    const lyrics = parseLyrics('[00:01.00]a\n[00:02.00]b\n[00:03.00]c\nwritten by someone');
    expect(lyrics?.kind).toBe('timed');
  });

  it('sorts stamps that were written out of order', () => {
    const lyrics = parseLyrics('[00:30.00]late\n[00:10.00]early');
    expect(lyrics).toEqual({
      kind: 'timed',
      lines: [
        { atMs: 10_000, text: 'early' },
        { atMs: 30_000, text: 'late' },
      ],
    });
  });

  it('drops metadata lines but keeps the words', () => {
    const lyrics = parseLyrics('[ar:Someone]\n[ti:Song]\n[00:01.00]a\n[00:02.00]b');
    expect(lyrics).toEqual({
      kind: 'timed',
      lines: [
        { atMs: 1000, text: 'a' },
        { atMs: 2000, text: 'b' },
      ],
    });
  });

  describe('the offset tag', () => {
    it('shifts every line earlier for a positive offset', () => {
      // The sign is inverted in the spec: +500 means show it 500ms sooner.
      const lyrics = parseLyrics('[offset:+500]\n[00:10.00]a');
      expect(lyrics).toEqual({ kind: 'timed', lines: [{ atMs: 9500, text: 'a' }] });
    });

    it('shifts later for a negative one', () => {
      const lyrics = parseLyrics('[offset:-500]\n[00:10.00]a');
      expect(lyrics).toEqual({ kind: 'timed', lines: [{ atMs: 10_500, text: 'a' }] });
    });

    it('never produces a negative timestamp', () => {
      const lyrics = parseLyrics('[offset:+5000]\n[00:01.00]a');
      expect(lyrics).toEqual({ kind: 'timed', lines: [{ atMs: 0, text: 'a' }] });
    });
  });
});

describe('following along', () => {
  const lines = [
    { atMs: 0, text: 'zero' },
    { atMs: 5000, text: 'five' },
    { atMs: 10_000, text: 'ten' },
  ];

  it('is -1 before the first line', () => {
    expect(activeLineIndex([{ atMs: 1000, text: 'a' }], 0)).toBe(-1);
  });

  it('lands on a line exactly at its own stamp', () => {
    expect(activeLineIndex(lines, 5000)).toBe(1);
  });

  it('holds a line until the next one starts', () => {
    expect(activeLineIndex(lines, 9999)).toBe(1);
    expect(activeLineIndex(lines, 10_000)).toBe(2);
  });

  it('stays on the last line past the end', () => {
    expect(activeLineIndex(lines, 999_999)).toBe(2);
  });

  it('is -1 for an empty lyric', () => {
    expect(activeLineIndex([], 1000)).toBe(-1);
  });
});
