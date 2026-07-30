module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      // jsxImportSource lets NativeWind add `className` to host components.
      ['babel-preset-expo', { jsxImportSource: 'nativewind' }],
      'nativewind/babel',
    ],
    plugins: [
      // drizzle-kit's expo output does `import m0000 from './0000_x.sql'` and
      // expects the file's *contents* as a string. Metro resolving the
      // extension is only half of it — this inlines the text. Both are
      // required; either alone leaves the migration bundle broken.
      ['inline-import', { extensions: ['.sql'] }],
    ],
  };
};
