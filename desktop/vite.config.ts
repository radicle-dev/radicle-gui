import path from "node:path";

import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vitest/config";

// https://vitejs.dev/config/
export default defineConfig({
  test: {
    environment: "happy-dom",
    include: ["tests/unit/**/*.test.ts"],
    reporters: "verbose",
  },
  plugins: [
    // Asciidoctor derives Node-only LIB_DIR/ROOT_DIR/DATA_DIR from
    // `import.meta.url`. Those paths are unused in the browser, but Vite still
    // emits the whole module as an asset, duplicating it unminified in the
    // bundle. Neutralize the URL so nothing is emitted.
    {
      name: "asciidoctor-drop-node-paths",
      enforce: "pre" as const,
      transform: {
        filter: { id: /@asciidoctor\/core/ },
        handler(code: string, id: string) {
          const pattern = /new URL\((.*?), import\.meta\.url\)/g;
          const patched = code.replaceAll(pattern, "new URL($1, `file:///`)");
          const expected = code.includes("DATA_DIR") ? 3 : 0;
          const found = code.match(pattern)?.length ?? 0;

          if (found !== expected) {
            throw new Error(
              `Expected ${expected} import.meta.url uses in ${id}, found ${found}. ` +
                `Asciidoctor may now rely on them at runtime; re-check before patching.`,
            );
          }

          return found > 0 ? { code: patched } : undefined;
        },
      },
    },
    // Asciidoctor's browser build lazily imports Node built-ins for file input
    // and output, behind guards that tolerate them being absent. Resolve them
    // to an empty module, as Vite would, without its externalization warning.
    {
      name: "asciidoctor-stub-node-builtins",
      enforce: "pre" as const,
      resolveId: {
        filter: { id: /^node:/ },
        handler(source: string, importer: string | undefined) {
          if (importer?.includes("@asciidoctor/core")) {
            return `\0asciidoctor-node-stub:${source}`;
          }
        },
      },
      load: {
        filter: { id: /^\0asciidoctor-node-stub:/ },
        handler() {
          return "export default {};";
        },
      },
    },
    svelte({
      // Reference: https://github.com/sveltejs/vite-plugin-svelte/issues/270#issuecomment-1033190138
      dynamicCompileOptions({ filename }) {
        if (path.basename(filename) === "Clipboard.svelte") {
          return { customElement: true };
        }
      },
    }),
  ],
  build: {
    outDir: "build",
    chunkSizeWarningLimit: 5000,
  },
  // prevent vite from obscuring rust errors
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      ignored: [
        "**/crates/radicle-tauri/**",
        "**/tests/artifacts/**",
        "**/tests/tmp/**",
      ],
    },
  },
  resolve: {
    // Svelte's server build never runs effects, which rune tests need.
    conditions: process.env.VITEST ? ["browser"] : undefined,
    alias: {
      "@app": path.resolve("./src"),
      "@bindings": path.resolve("./crates/radicle-types/bindings/"),
    },
  },
});
