const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

// drizzle-kit's expo output imports the generated .sql files directly, and
// Metro does not resolve that extension by default.
config.resolver.sourceExts.push('sql');

module.exports = withNativeWind(config, { input: './src/theme/global.css' });
