const { defineConfig } = require('eslint/config');
const tsPlugin = require('@typescript-eslint/eslint-plugin');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', 'android/*', 'ios/*', '.expo/*'],
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    plugins: { '@typescript-eslint': tsPlugin },
    rules: {
      // AGENTS.md: no `any`, and no silent `@ts-ignore`.
      '@typescript-eslint/no-explicit-any': 'error',
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
