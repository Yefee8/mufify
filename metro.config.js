const path = require('node:path');

const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

// drizzle-kit's expo output imports the generated .sql files directly, and
// Metro does not resolve that extension by default. babel-plugin-inline-import
// then turns the resolved file into a string — both halves are required.
config.resolver.sourceExts.push('sql');

// The local Expo module in modules/. Native side is autolinked; this is the
// JS side, so `import AudioTags from 'audio-tags'` resolves without a
// relative path chain.
config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  'audio-tags': path.resolve(__dirname, 'modules/audio-tags'),
};
config.watchFolders = [...(config.watchFolders ?? []), path.resolve(__dirname, 'modules')];

module.exports = withNativeWind(config, { input: './src/theme/global.css' });
