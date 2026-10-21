import { radicleConfig } from "@radicle-gui/ui/eslint";

export default radicleConfig({
  rootDir: import.meta.dirname,
  importGroups: [
    // Files under @app and @lib without an extension
    ["^(@app\/lib).*(\.svelte$|\.ts$|\.js$){0}"],
    // Files under @app and @lib ending in .svelte or svelte.ts
    ["^(@app\/lib).*(\.svelte$)"],
    // Svelte components imported through @app
    ["^(@app).*(\.svelte$)"],
  ],
  ignores: [
    "build/*",
    "tests/tmp/**/*",
    "isolation/*",
    "node_modules/**/*",
    "target/*",
    "target-release/*",
    "crates/radicle-tauri/**/*",
    "crates/radicle-types/**/*",
    "eslint.config.js",
  ],
});
