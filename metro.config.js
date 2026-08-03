/**
 * Metro configuration.
 *
 * Extends the Expo defaults. TypeScript path aliases declared in tsconfig.json
 * are honoured via `experiments.tsconfigPaths` (app.json).
 */
const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

module.exports = config;
