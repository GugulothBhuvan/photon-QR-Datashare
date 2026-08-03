/**
 * Babel configuration.
 *
 * `babel-preset-expo` covers Expo Router, React Native, and the Reanimated /
 * Worklets transforms. Path aliases are resolved by Metro through the
 * `experiments.tsconfigPaths` flag in app.json, so no module-resolver plugin
 * is required here.
 */
module.exports = function babelConfig(api) {
  api.cache(true);

  return {
    presets: [['babel-preset-expo', { jsxImportSource: 'react' }]],
  };
};
