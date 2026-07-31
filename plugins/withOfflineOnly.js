const { withDangerousMod } = require('expo/config-plugins');
const fs = require('node:fs');
const path = require('node:path');

/**
 * Keep `INTERNET` out of the shipped app, and only out of the shipped app.
 *
 * "No network. No accounts. No telemetry." is the app's headline promise and,
 * per AGENTS.md, the reason it exists. A user checking the Play Store listing
 * sees the permission list, so declaring `INTERNET` undercuts the claim no
 * matter how honest the code is — and it is the one permission that makes
 * every other assurance unverifiable.
 *
 * It cannot simply be blocked, though. A debug build reaches Metro over HTTP,
 * so removing it everywhere breaks the development loop entirely. Expo's
 * `blockedPermissions` is all-or-nothing, so instead:
 *
 *   - `app.json` blocks `INTERNET` in the main manifest, which is what release
 *     builds ship
 *   - this plugin adds it back to the *debug* manifest, which is merged only
 *     into debug builds
 *
 * The result is a release APK with no network permission and a debug APK that
 * can still talk to the dev server.
 */
const INTERNET_PERMISSION = '<uses-permission android:name="android.permission.INTERNET"/>';

const withOfflineOnly = (config) =>
  withDangerousMod(config, [
    'android',
    (config) => {
      const manifestPath = path.join(
        config.modRequest.platformProjectRoot,
        'app',
        'src',
        'debug',
        'AndroidManifest.xml',
      );

      if (!fs.existsSync(manifestPath)) return config;

      const manifest = fs.readFileSync(manifestPath, 'utf8');
      if (manifest.includes('android.permission.INTERNET')) return config;

      // `tools:node="remove"` in the main manifest wins over a plain
      // declaration during merge, so the debug entry has to override it back.
      const debugPermission = INTERNET_PERMISSION.replace(
        '/>',
        ' tools:node="replace"/>',
      );

      fs.writeFileSync(
        manifestPath,
        manifest.replace('<manifest', `<!-- Added by plugins/withOfflineOnly.js -->\n<manifest`).replace(
          /(<manifest[^>]*>)/,
          `$1\n\n    ${debugPermission}`,
        ),
        'utf8',
      );

      return config;
    },
  ]);

module.exports = withOfflineOnly;
