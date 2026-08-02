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
  // Ignoring the *tests* there is not enough. Each checkout also carries a copy
  // of `modules/audio-focus/package.json`, and four packages claiming the name
  // `audio-focus` make the Haste map ambiguous — `jest.mock('audio-focus')`
  // then fails to resolve at all, and every run printed a duplicate-name
  // warning nobody could act on.
  modulePathIgnorePatterns: ['<rootDir>/\\.claude/'],
  // AGENTS.md: real coverage on services/, not on components.
  collectCoverageFrom: ['src/services/**/*.ts', 'src/utils/**/*.ts'],
};
