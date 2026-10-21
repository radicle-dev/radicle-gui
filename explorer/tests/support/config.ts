// Test adapter for configuration in Node.js environment (Playwright tests).
//
// The app reads `buildTimeConfig`, which Vite replaces at build time (via
// the `define` option) with config.util.toObject() from the "config" npm
// package. Since Vite's `define` replacement doesn't run in Node.js, this file
// provides the same configuration data by directly importing and converting
// the "config" package.
import nodeConfig from "config";

const config = nodeConfig.util.toObject() as typeof buildTimeConfig;

export default config;
