// react-native-mmkv swaps in its own mock under Jest, but only after its
// module graph loads — and that graph pulls in react-native-nitro-modules,
// which calls TurboModuleRegistry.getEnforcing at import time and throws.
// Stubbing the native bridge lets the real MMKV mock do its job.
jest.mock('react-native-nitro-modules', () => ({
  NitroModules: {
    createHybridObject: () => ({}),
    box: (value) => value,
  },
}));

// Phase 1 adds the in-memory SQLite harness here; Phase 3 the AudioEngine mock.
