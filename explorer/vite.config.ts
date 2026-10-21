import config from "config";
import path from "node:path";
import { defineConfig } from "vitest/config";
import { svelte } from "@sveltejs/vite-plugin-svelte";

import { assets } from "./vite-plugin-assets";

export default defineConfig({
  define: {
    buildTimeConfig: JSON.stringify(config.util.toObject()),
  },
  test: {
    environment: "jsdom",
    include: ["tests/unit/**/*.test.ts"],
    reporters: "verbose",
  },
  plugins: [
    assets(),
    svelte({
      extensions: [".svelte", ".md"],
      // Reference: https://github.com/sveltejs/vite-plugin-svelte/issues/270#issuecomment-1033190138
      dynamicCompileOptions({ filename }) {
        if (
          path.basename(filename) === "Clipboard.svelte" ||
          path.basename(filename) === "ExternalLink.svelte" ||
          path.basename(filename) === "Icon.svelte"
        ) {
          return { customElement: true };
        }
      },
      compilerOptions: { dev: process.env.NODE_ENV !== "production" },
    }),
    {
      name: "inject-config-loader",
      transformIndexHtml() {
        if (process.env.VITE_RUNTIME_CONFIG === "true") {
          return [
            {
              tag: "script",
              attrs: {
                type: "text/javascript",
              },
              children: `
      try {
        const xhr = new XMLHttpRequest();
        xhr.open("GET", "/config.json", false);
        xhr.send(null);
        window.__CONFIG__ = JSON.parse(xhr.responseText);
      } catch {
        console.warn("Couldn't load config.json from the server, using built-in fallback config.");
      }
    `,
              injectTo: "head-prepend",
            },
          ];
        }
      },
    },
  ],
  optimizeDeps: {
    include: [
      "@wooorm/starry-night",
      "@wooorm/starry-night/etc",
      "@wooorm/starry-night/go.mod",
      "@wooorm/starry-night/go.sum",
      "@wooorm/starry-night/source.batchfile",
      "@wooorm/starry-night/source.dockerfile",
      "@wooorm/starry-night/source.dotenv",
      "@wooorm/starry-night/source.editorconfig",
      "@wooorm/starry-night/source.erlang",
      "@wooorm/starry-night/source.git-revlist",
      "@wooorm/starry-night/source.gitattributes",
      "@wooorm/starry-night/source.gitconfig",
      "@wooorm/starry-night/source.gitignore",
      "@wooorm/starry-night/source.groovy.gradle",
      "@wooorm/starry-night/source.haproxy-config",
      "@wooorm/starry-night/source.ini.npmrc",
      "@wooorm/starry-night/source.json",
      "@wooorm/starry-night/source.nix",
      "@wooorm/starry-night/source.sass",
      "@wooorm/starry-night/source.solidity",
      "@wooorm/starry-night/source.svelte",
      "@wooorm/starry-night/source.toml",
      "@wooorm/starry-night/source.tsx",
      "@wooorm/starry-night/source.zig",
      "@wooorm/starry-night/text.html.asciidoc",
      "@wooorm/starry-night/text.html.django",
      "@wooorm/starry-night/text.html.vue",
      "@wooorm/starry-night/text.robots-txt",
      "@wooorm/starry-night/text.zone_file",
    ],
  },
  server: {
    host: "localhost",
    port: 3000,
    watch: {
      // reference: https://stackoverflow.com/a/75238360
      useFsEvents: false,
    },
  },
  resolve: {
    alias: {
      "@app": path.resolve("./src"),
      "@public": path.resolve("./public"),
      "@http-client": path.resolve("./http-client"),
      "@tests": path.resolve("./tests"),
    },
  },
  build: {
    outDir: "build",
  },
});
