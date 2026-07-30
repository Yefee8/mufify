/**
 * Semantic-only design system. Components may use the class names produced
 * here and nothing else — no raw palette values, no arbitrary values.
 *
 * The colour vocabulary is split across backgroundColor / textColor /
 * borderColor on purpose, so that `bg-surface` and `text-primary` exist but
 * nonsense like `bg-primary` or `text-subtle` does not.
 */

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  darkMode: 'class',
  theme: {
    // Overridden, not extended: this *is* the spacing scale. 4px base.
    spacing: {
      0: '0px',
      1: '4px',
      2: '8px',
      3: '12px',
      4: '16px',
      5: '20px',
      6: '24px',
      8: '32px',
      10: '40px',
      // 44px is the minimum accessible touch target, not a layout step.
      11: '44px',
      12: '48px',
      16: '64px',
    },
    // Overridden: no rounded-lg/xl/2xl. Album art is sharp; only transport
    // controls are circular.
    borderRadius: {
      none: '0px',
      xs: '2px',
      sm: '4px',
      md: '8px',
      full: '9999px',
    },
    // Overridden, not extended. Extending would leave Tailwind's default
    // palette in place and `bg-indigo-600` would still compile, which
    // AGENTS.md forbids. There is no palette here — only roles.
    backgroundColor: {
      transparent: 'transparent',
      surface: 'rgb(var(--color-chassis) / <alpha-value>)',
      'surface-elevated': 'rgb(var(--color-panel) / <alpha-value>)',
      accent: 'rgb(var(--color-signal) / <alpha-value>)',
    },
    textColor: {
      primary: 'rgb(var(--color-label) / <alpha-value>)',
      muted: 'rgb(var(--color-legend) / <alpha-value>)',
      accent: 'rgb(var(--color-signal) / <alpha-value>)',
      'on-accent': 'rgb(var(--color-on-signal) / <alpha-value>)',
    },
    borderColor: {
      // A bare `border` draws the hairline rule.
      DEFAULT: 'rgb(var(--color-etch) / <alpha-value>)',
      transparent: 'transparent',
      subtle: 'rgb(var(--color-etch) / <alpha-value>)',
      accent: 'rgb(var(--color-signal) / <alpha-value>)',
    },
    extend: {
      // React Native picks a font by full family name, so each weight is its
      // own class. Keep this list in step with src/theme/fonts.ts.
      fontFamily: {
        // Display — screen titles, now-playing track.
        display: ['Archivo_600SemiBold'],
        'display-bold': ['Archivo_700Bold'],
        // Body — lists and everything else.
        body: ['Inter_400Regular'],
        'body-medium': ['Inter_500Medium'],
        'body-semibold': ['Inter_600SemiBold'],
        // Mono — every technical value. Tabular figures.
        mono: ['JetBrainsMono_400Regular'],
        'mono-medium': ['JetBrainsMono_500Medium'],
      },
    },
  },
  plugins: [],
};
