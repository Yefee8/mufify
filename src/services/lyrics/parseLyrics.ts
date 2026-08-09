/**
 * Turn whatever a tagger wrote into something a screen can render.
 *
 * Two shapes come out, and the difference decides the whole experience: a
 * plain lyric is a page of text, a timed one follows the music. Nothing else
 * in the feature branches on format — the reader hands over a string, this
 * decides what it is, and the screen renders one of two things.
 */

/** One line of a timed lyric. */
export interface TimedLyricLine {
  /** When this line starts, in milliseconds from the beginning of the track. */
  atMs: number;
  /**
   * The words. Empty for the silent stretches an LRC marks between verses —
   * kept rather than dropped, because a blank line is how the file says
   * "nothing is being sung now" and the screen needs to stop highlighting.
   */
  text: string;
}

export type Lyrics =
  | { kind: 'timed'; lines: TimedLyricLine[] }
  | { kind: 'plain'; lines: string[] };

/**
 * `[mm:ss.xx]`, `[mm:ss.xxx]` or `[mm:ss]`, and hours if someone tagged a mix.
 *
 * Fractions are two digits in the LRC convention and three in every file that
 * was converted from something else, so both are taken and scaled by their own
 * width rather than assumed to be hundredths.
 */
const TIMESTAMP = /\[(?:(\d+):)?(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;

/**
 * Metadata lines an LRC may carry: `[ar:...]`, `[ti:...]`, `[offset:+250]`.
 *
 * Matched by having a non-numeric tag, which is what separates them from a
 * timestamp without needing to know every key that exists.
 */
const METADATA = /^\[([a-z]+):(.*)\]$/i;

/**
 * How far to shift every timestamp, in milliseconds, from an `[offset:]` tag.
 *
 * The sign is the opposite of the intuitive one and it is in the spec that way:
 * a positive offset means the lyrics should appear *earlier*.
 */
function readOffset(line: string): number | null {
  const match = METADATA.exec(line);
  if (match === null || match[1]?.toLowerCase() !== 'offset') return null;
  const value = Number.parseInt(match[2]?.trim() ?? '', 10);
  return Number.isFinite(value) ? -value : null;
}

/**
 * Parse embedded lyrics.
 *
 * Returns null for nothing worth showing, so a caller can decide whether the
 * button exists at all with one check rather than by inspecting the result.
 */
export function parseLyrics(raw: string | null | undefined): Lyrics | null {
  if (raw == null) return null;

  // Files written on Windows, and files written by a tagger that escaped the
  // newlines, both turn up. Normalise before anything looks at line breaks.
  const text = raw.replace(/\r\n?/g, '\n').replace(/\\n/g, '\n');
  if (text.trim() === '') return null;

  const rows = text.split('\n');

  let offsetMs = 0;
  for (const row of rows) {
    const offset = readOffset(row.trim());
    if (offset !== null) {
      offsetMs = offset;
      break;
    }
  }

  const timed: TimedLyricLine[] = [];
  const plain: string[] = [];

  for (const row of rows) {
    const trimmed = row.trim();

    // A metadata line is never shown, in either shape. Its tag is letters, so
    // this cannot swallow a timestamp.
    if (METADATA.test(trimmed)) continue;

    TIMESTAMP.lastIndex = 0;
    const stamps = [...trimmed.matchAll(TIMESTAMP)];

    if (stamps.length === 0) {
      plain.push(trimmed);
      continue;
    }

    /*
     * One line can carry several timestamps — that is how an LRC writes a
     * refrain without repeating its words. Each gets its own entry pointing at
     * the same text.
     */
    const words = trimmed.replace(TIMESTAMP, '').trim();
    for (const stamp of stamps) {
      const hours = Number.parseInt(stamp[1] ?? '0', 10);
      const minutes = Number.parseInt(stamp[2] ?? '0', 10);
      const seconds = Number.parseInt(stamp[3] ?? '0', 10);
      const fractionText = stamp[4] ?? '';
      // Scaled by its own width: ".5" is half a second, ".05" a twentieth.
      const fraction =
        fractionText === '' ? 0 : Number.parseInt(fractionText, 10) / 10 ** fractionText.length;

      const atMs = Math.round(
        (hours * 3600 + minutes * 60 + seconds) * 1000 + fraction * 1000 + offsetMs,
      );
      timed.push({ atMs: Math.max(0, atMs), text: words });
    }

    plain.push(words);
  }

  /*
   * A file is timed when it is *mostly* timed. Some taggers leave a credit or
   * a blank line without a stamp, and one of those should not turn a synced
   * lyric into a wall of text — nor should a single stray `[00:00]` at the top
   * of an otherwise plain lyric promise a sync that never arrives.
   */
  const meaningful = plain.filter((line) => line !== '').length;
  if (timed.length > 0 && timed.length >= meaningful / 2) {
    timed.sort((a, b) => a.atMs - b.atMs);
    return { kind: 'timed', lines: timed };
  }

  const body = trimEdges(plain);
  return body.length === 0 ? null : { kind: 'plain', lines: body };
}

/** Blank lines inside a lyric are structure; blank lines around it are noise. */
function trimEdges(lines: string[]): string[] {
  let start = 0;
  let end = lines.length;
  while (start < end && lines[start] === '') start += 1;
  while (end > start && lines[end - 1] === '') end -= 1;
  return lines.slice(start, end);
}

/**
 * Which line is being sung at `positionMs`, or -1 before the first one.
 *
 * A plain index rather than the line itself, because the screen needs it to
 * scroll to as well as to style, and looking it up twice is how those two
 * drift apart.
 *
 * Linear from the end: lyrics are short and playback moves forwards, so the
 * answer is almost always the last line or the one before it.
 */
export function activeLineIndex(lines: readonly TimedLyricLine[], positionMs: number): number {
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];
    if (line !== undefined && line.atMs <= positionMs) return index;
  }
  return -1;
}
