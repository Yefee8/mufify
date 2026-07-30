const { defineConfig } = require('eslint/config');
const tsPlugin = require('@typescript-eslint/eslint-plugin');
const expoConfig = require('eslint-config-expo/flat');

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
      // Enforce the layer direction: app/ routes stay thin, src/ never
      // reaches back up into app/.
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/app/*', '**/app'],
              message:
                'src/ must not import from app/. Layers point downward: components -> hooks -> services -> db.',
            },
          ],
        },
      ],
    },
  },
]);
