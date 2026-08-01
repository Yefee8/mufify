/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/react-native|native-base|react-native-svg|nativewind|react-native-css-interop)',
  ],
  // Overriding this drops the default, so /node_modules/ is repeated here.
  // `.claude/worktrees/*` holds full checkouts of other branches; without
  // this, every suite there is collected a second time.
  testPathIgnorePatterns: ['/node_modules/', '/\\.claude/'],
  // AGENTS.md: real coverage on services/, not on components.
  collectCoverageFrom: ['src/services/**/*.ts', 'src/utils/**/*.ts'],
};
