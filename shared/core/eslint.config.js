import js from "@eslint/js";
import ts from "typescript-eslint";

// Core is plain domain logic that both apps and shared/ui build on. Its
// tsconfig leaves out DOM and Node types; this keeps out the packages that
// would tie it to a framework, an app or a transport.
export default [
  js.configs.recommended,
  ...ts.configs.recommended,
  {
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["svelte", "svelte/*"],
              message: "Core has no Svelte dependencies.",
            },
            {
              group: [
                "@tauri-apps/*",
                "@bindings/*",
                "@app/*",
                "@http-client/*",
              ],
              message: "Core doesn't depend on either app.",
            },
            {
              group: ["@radicle-gui/ui", "@radicle-gui/ui/*"],
              message: "shared/ui depends on core, never the other way round.",
            },
          ],
        },
      ],
    },
  },
];
