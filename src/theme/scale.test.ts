import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { SPACING } from './tokens';

/**
 * Every spacing-derived class must exist in the scale.
 *
 * `tailwind.config.js` **overrides** the spacing scale rather than extending it,
 * so a class built from a value that is not in it produces no CSS at all. There
 * is no warning, no error, and no visual hint — the element simply has no size.
 *
 * This is not hypothetical. Every one of these shipped and was invisible:
 *
 * - `h-32 w-32` on the artist and album detail cover, so the header drew at zero
 *   by zero and the artwork never appeared.
 * - the same on the playlist mosaic at `size="lg"`.
 * - `w-24` on the swipe-to-queue reveal track, so the action strip behind a
 *   swiped row had no width and its icon was never seen.
 * - `h-7 w-7` on the track picker's checkbox.
 * - `max-h-96` on two bottom sheets.
 *
 * `AGENTS.md` names this trap and it caught us anyway, because the failure mode
 * is silence. A test is the only thing that turns it into noise.
 *
 * Fractions (`w-1/2`), `full`, `auto`, `px` and arbitrary values are all left
 * alone: those come from Tailwind's own scales, which are not overridden. Only
 * bare numbers are checked.
 */

const SOURCE_ROOTS = ['src', 'app'];
const SOURCE_EXTENSIONS = ['.ts', '.tsx'];

/** Utilities whose numeric values come from `theme.spacing`. */
const SPACED = [
  'w',
  'h',
  'min-w',
  'min-h',
  'max-w',
  'max-h',
  'p',
  'px',
  'py',
  'pt',
  'pb',
  'pl',
  'pr',
  'm',
  'mx',
  'my',
  'mt',
  'mb',
  'ml',
  'mr',
  'gap',
  'gap-x',
  'gap-y',
  'top',
  'bottom',
  'left',
  'right',
  'inset',
  'inset-x',
  'inset-y',
  'size',
];

const ALLOWED = new Set(Object.keys(SPACING));
const PATTERN = new RegExp(`\\b(${SPACED.join('|')})-(\\d+)\\b`, 'g');

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return SOURCE_EXTENSIONS.some((extension) => path.endsWith(extension)) ? [path] : [];
  });
}

describe('spacing scale', () => {
  it('has no class built from a value outside the scale', () => {
    const offenders: string[] = [];

    for (const root of SOURCE_ROOTS) {
      for (const file of sourceFiles(root)) {
        // Skip this file, whose whole job is to contain the examples.
        if (file.endsWith('scale.test.ts')) continue;

        const source = readFileSync(file, 'utf8');
        for (const [match, , value] of source.matchAll(PATTERN)) {
          if (value !== undefined && !ALLOWED.has(value)) {
            offenders.push(`${file}: ${match}`);
          }
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it('keeps the TypeScript scale and the Tailwind config in step', () => {
    // `tokens.test.ts` guards the colours the same way. This is the spacing
    // half: the two files are synchronised by hand, and the config is the one
    // that decides whether a class compiles.
    const config = readFileSync('tailwind.config.js', 'utf8');
    const spacingBlock = config.slice(config.indexOf('spacing: {'), config.indexOf('borderRadius'));

    for (const [key, value] of Object.entries(SPACING)) {
      expect(spacingBlock).toContain(`${key}: '${value}px'`);
    }
  });
});
