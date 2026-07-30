const { defineConfig } = require('eslint/config');
const tsPlugin = require('@typescript-eslint/eslint-plugin');
const expoConfig = require('eslint-config-expo/flat');

/** Layers point downward: components -> hooks -> services -> db. */
const LAYER_DIRECTION = {
  group: ['**/app/*', '**/app'],
  message:
    'src/ must not import from app/. Layers point downward: components -> hooks -> services -> db.',
};

/** AGENTS.md architecture rule 3: only src/db may touch the ORM. */
const DATABASE_BOUNDARY = {
  group: ['drizzle-orm', 'drizzle-orm/*', 'expo-sqlite', 'expo-sqlite/*'],
  message:
    'Only src/db may import Drizzle or expo-sqlite. Call a typed query function from src/db/queries instead.',
};

/** AGENTS.md architecture rule 2: only src/services/audio may touch playback. */
const AUDIO_BOUNDARY = {
  group: ['expo-audio', 'expo-audio/*'],
  message: 'Only src/services/audio may import the playback library. Talk to AudioEngine instead.',
};

const RESTRICTED_IMPORTS = [LAYER_DIRECTION, DATABASE_BOUNDARY, AUDIO_BOUNDARY];

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', 'android/*', 'ios/*', '.expo/*'],
  },
  {
    files: ['**/*.test.ts', '**/*.test.tsx', 'jest.setup.js'],
    languageOptions: {
      globals: {
        jest: 'readonly',
        describe: 'readonly',
        it: 'readonly',
        expect: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
      },
    },
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    plugins: { '@typescript-eslint': tsPlugin },
    rules: {
      // AGENTS.md: no `any`, and no silent `@ts-ignore`.
      '@typescript-eslint/no-explicit-any': 'error',
      'no-restricted-syntax': [
        'error',
        {
          // AGENTS.md: no arbitrary Tailwind values. The config can block
          // off-scale utilities but not `p-[13px]`, so it is caught here.
          // If you need the value, add it to the scale in tailwind.config.js.
          selector: 'JSXAttribute[name.name=/[cC]lassName$/] Literal[value=/\\[[^\\]]+\\]/]',
          message:
            'Arbitrary Tailwind value. Add a named token to the scale in tailwind.config.js instead.',
        },
      ],
      'no-restricted-imports': ['error', { patterns: RESTRICTED_IMPORTS }],
    },
  },
  {
    // src/db owns the database. The restriction above would forbid it from
    // importing its own tools, so it is relaxed here — and only here.
    files: ['src/db/**/*.ts', 'drizzle.config.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [LAYER_DIRECTION] }],
    },
  },
  {
    // Likewise, the audio engine is the one place allowed to know which
    // playback library is in use. See AGENTS.md architecture rule 2.
    files: ['src/services/audio/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [LAYER_DIRECTION, DATABASE_BOUNDARY] }],
    },
  },
]);
