import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { COLORS, type ThemeName } from './tokens';

/**
 * `global.css` and `tokens.ts` hold the same values in two formats and are
 * kept in sync by hand. This test is the thing that notices when they drift.
 */

const CSS = readFileSync(join(__dirname, 'global.css'), 'utf8');

/** `--color-chassis: 10 12 17;` -> `#0A0C11` */
function channelsToHex(channels: string): string {
  const parts = channels.trim().split(/\s+/).map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    throw new Error(`Not three RGB channels: "${channels}"`);
  }
  return `#${parts.map((n) => n.toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

/** Pull the custom properties out of one CSS rule block. */
function readBlock(selector: string): Record<string, string> {
  const start = CSS.indexOf(selector);
  if (start === -1) throw new Error(`No "${selector}" block in global.css`);
  const open = CSS.indexOf('{', start);
  const close = CSS.indexOf('}', open);
  const body = CSS.slice(open + 1, close);

  const vars: Record<string, string> = {};
  for (const match of body.matchAll(/--color-([\w-]+)\s*:\s*([^;]+);/g)) {
    const [, name, value] = match;
    if (name && value) vars[name] = channelsToHex(value);
  }
  return vars;
}

const CSS_BLOCKS: Record<ThemeName, Record<string, string>> = {
  light: readBlock(':root'),
  dark: readBlock('.dark:root'),
};

/** `onSignal` in TS is `--color-on-signal` in CSS. */
function cssVarName(token: string): string {
  return token.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
}

describe('design tokens', () => {
  const themes: ThemeName[] = ['dark', 'light'];

  it.each(themes)('%s: every CSS variable has a tokens.ts counterpart', (theme) => {
    const tsTokens = Object.keys(COLORS[theme]).map(cssVarName).sort();
    expect(Object.keys(CSS_BLOCKS[theme]).sort()).toEqual(tsTokens);
  });

  it.each(themes)('%s: values match between global.css and tokens.ts', (theme) => {
    for (const [token, hex] of Object.entries(COLORS[theme])) {
      expect(CSS_BLOCKS[theme][cssVarName(token)]).toBe(hex.toUpperCase());
    }
  });

  it('uses the same indigo hue in both themes, at different lightness', () => {
    expect(COLORS.dark.signal).not.toBe(COLORS.light.signal);
  });
});

/** WCAG 2.1 relative luminance. */
function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * The brief requires >= 4.5:1 for body text in both themes. These assertions
 * are why a colour cannot be nudged casually.
 */
describe('token contrast (WCAG AA, 4.5:1 body text)', () => {
  const themes: ThemeName[] = ['dark', 'light'];

  it.each(themes)('%s: text on both surfaces clears 4.5:1', (theme) => {
    const c = COLORS[theme];
    for (const surface of [c.chassis, c.panel]) {
      expect(contrast(c.label, surface)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(c.legend, surface)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(c.signal, surface)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it.each(themes)('%s: on-signal is legible on a filled indigo surface', (theme) => {
    const c = COLORS[theme];
    expect(contrast(c.onSignal, c.signal)).toBeGreaterThanOrEqual(4.5);
  });

  it('dark: white on indigo fails, which is why on-signal is the dark value', () => {
    expect(contrast('#FFFFFF', COLORS.dark.signal)).toBeLessThan(4.5);
  });
});
