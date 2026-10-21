import { radicleConfig, restrictedGlobals } from "./eslint.base.js";

// Shared components get their data from props and report changes through
// callbacks; the apps own all I/O and navigation.
const sideEffects = ["fetch", "localStorage", "sessionStorage", "location"];

export default [
  ...radicleConfig({
    rootDir: import.meta.dirname,
    ignores: ["node_modules/**/*", "eslint.config.js", "eslint.base.js"],
  }),
  {
    files: ["**/*.js", "**/*.ts", "**/*.svelte"],
    rules: {
      "no-restricted-globals": ["error", ...restrictedGlobals, ...sideEffects],
      "no-restricted-properties": [
        "error",
        ...["window", "globalThis", "self"].flatMap(object =>
          sideEffects.map(property => ({ object, property })),
        ),
      ],
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "@app/*",
                "@bindings/*",
                "@http-client",
                "@http-client/*",
                "@tauri-apps/*",
              ],
              message:
                "Shared code can't depend on either app; take the data as props instead.",
            },
            {
              group: ["../../*"],
              message: "Shared code can't import from outside shared/ui.",
            },
          ],
        },
      ],
    },
  },
];
