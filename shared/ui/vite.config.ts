import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "happy-dom",
    include: ["tests/**/*.test.ts"],
    reporters: "verbose",
  },
  plugins: [svelte()],
  // Svelte's server build never runs effects, which rune tests need.
  resolve: { conditions: process.env.VITEST ? ["browser"] : undefined },
});
