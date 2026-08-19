import type { CurvePoint } from './presets';

/**
 * A saved equaliser preset as a line of text somebody can send to a friend.
 *
 * **Text rather than a share intent, and that is the point.** This app has no
 * network layer and does not hand files to other apps — the track action sheet
 * turns down "share file" for exactly that reason. A preset is different in
 * kind from a track: it is nine numbers this app made up, not the user's
 * music. So it is offered as something to *copy*, and what happens to it after
 * that is the user's business and nobody else's. Nothing leaves the device
 * unless a person pastes it somewhere.
 *
 * Plain and inspectable rather than base64. Somebody who receives one of these
 * can read what it will do to their sound before they apply it, which for a
 * string arriving from a stranger is worth more than four characters saved.
 *
 * The format, one line, ASCII:
 *
 *     mufify-eq/1|Late night|31:+3,62:+1.5,125:0,...
 *
 * Frequencies in hertz, gains in decibels. The version is first so that a
 * later format can be recognised and refused by name instead of being
 * misparsed into somebody's ears.
 */

const PREFIX = 'mufify-eq';
const VERSION = 1;

/** Long enough to be a name, short enough not to be a paragraph. */
export const MAX_PRESET_NAME = 40;

/** A parse either produces a preset or says, in one word, what was wrong. */
export type DecodeResult =
  | { ok: true; name: string; points: CurvePoint[] }
  | { ok: false; reason: 'not-a-preset' | 'wrong-version' | 'malformed' };

export function encodePresetCode(name: string, points: readonly CurvePoint[]): string {
  const body = points.map((point) => `${Math.round(point.hz)}:${formatDb(point.db)}`).join(',');
  return `${PREFIX}/${VERSION}|${sanitiseName(name)}|${body}`;
}

/**
 * Read a code back, refusing anything it is not sure of.
 *
 * Every failure here is silent nonsense if it is guessed at instead: a gain
 * read as 30 rather than 3.0 is not a wrong number on a screen, it is a
 * distorted output the user has to work backwards from. So the rules are
 * strict — a finite number in range, at a plausible frequency, or no preset.
 */
export function decodePresetCode(code: string): DecodeResult {
  const trimmed = code.trim();
  const parts = trimmed.split('|');
  if (parts.length !== 3) return { ok: false, reason: 'not-a-preset' };

  const [header, rawName, body] = parts as [string, string, string];
  const [prefix, version] = header.split('/');
  if (prefix !== PREFIX) return { ok: false, reason: 'not-a-preset' };
  if (version !== String(VERSION)) return { ok: false, reason: 'wrong-version' };

  const points: CurvePoint[] = [];
  for (const entry of body.split(',')) {
    const [rawHz, rawDb] = entry.split(':');
    if (rawHz === undefined || rawDb === undefined) return { ok: false, reason: 'malformed' };

    const hz = Number(rawHz);
    const db = Number(rawDb);
    // 20Hz to 24kHz covers hearing and every sample rate's Nyquist. `Number`
    // accepts '', 'Infinity' and '0x10', none of which belong in a curve.
    if (!Number.isFinite(hz) || hz < 20 || hz > 24_000) return { ok: false, reason: 'malformed' };
    if (!Number.isFinite(db) || Math.abs(db) > 15) return { ok: false, reason: 'malformed' };
    if (rawHz.trim() === '' || rawDb.trim() === '') return { ok: false, reason: 'malformed' };

    points.push({ hz, db });
  }

  if (points.length === 0) return { ok: false, reason: 'malformed' };

  const name = sanitiseName(rawName);
  // Ascending frequency, because `gainAt` walks the points in order and would
  // otherwise interpolate backwards across an out-of-order pair.
  points.sort((left, right) => left.hz - right.hz);

  return { ok: true, name: name || 'Custom', points };
}

/**
 * A name that cannot break the format or the layout.
 *
 * The separator is stripped rather than escaped: an escaping scheme is a second
 * thing to get right in a parser whose whole job is to be boring, and a name
 * with a pipe in it is not something anyone will miss. Newlines go too — the
 * code is one line, and a pasted name carrying a line break would split it.
 */
export function sanitiseName(name: string): string {
  return name
    .replace(/[|\r\n\t]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
    .slice(0, MAX_PRESET_NAME);
}

/** At most one decimal, with the sign kept — `+0` reads as deliberate. */
function formatDb(db: number): string {
  const rounded = Math.round((Number.isFinite(db) ? db : 0) * 10) / 10;
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return rounded > 0 ? `+${text}` : text;
}
