import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { COLORS, type ThemeName } from './tokens';

/**
 * The home-screen widgets are drawn by the launcher from Android resources,
 * which cannot read the app's CSS variables — so the colours they use are
 * copies, one file per theme. This is what notices when the copies drift
 * from `tokens.ts`, the same way `tokens.test.ts` does for `global.css`.
 */

const RES = join(__dirname, '../../modules/widgets/android/src/main/res');

const FILES: Record<ThemeName, string> = {
  light: join(RES, 'values/mufify_widget_colors.xml'),
  dark: join(RES, 'values-night/mufify_widget_colors.xml'),
};

/** Which token each widget colour copies. */
const SOURCES = {
  mufify_widget_surface: 'chassis',
  mufify_widget_elevated: 'panel',
  mufify_widget_label: 'label',
  mufify_widget_muted: 'legend',
  mufify_widget_accent: 'signal',
  mufify_widget_on_accent: 'onSignal',
} as const;

function readColors(file: string): Record<string, string> {
  const xml = readFileSync(file, 'utf8');
  const colors: Record<string, string> = {};
  for (const match of xml.matchAll(/<color name="([a-z_]+)">(#[0-9A-Fa-f]{6})<\/color>/gu)) {
    const [, name, value] = match;
    if (name !== undefined && value !== undefined) colors[name] = value.toUpperCase();
  }
  return colors;
}

describe.each(['light', 'dark'] as const)('widget colours, %s', (theme) => {
  const colors = readColors(FILES[theme]);

  it('define exactly the colours the widgets use', () => {
    expect(Object.keys(colors).sort()).toEqual(Object.keys(SOURCES).sort());
  });

  it.each(Object.entries(SOURCES))('%s matches the %s token', (name, token) => {
    expect(colors[name]).toBe(COLORS[theme][token].toUpperCase());
  });
});
