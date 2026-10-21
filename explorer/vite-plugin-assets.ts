import type { Plugin } from "vite";

import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

function packageDir(name: string): string {
  return path.dirname(require.resolve(`${name}/package.json`));
}

function packageVersion(name: string): string {
  const { version } = require(`${name}/package.json`) as { version: string };
  return version;
}

// index.html loads /katex.min.css, so the stylesheet and the fonts it
// references must be in the public directory.
async function copyKatexAssets(publicDir: string) {
  const dist = path.join(packageDir("katex"), "dist");

  await fs.copyFile(
    path.join(dist, "katex.min.css"),
    path.join(publicDir, "katex.min.css"),
  );
  await fs.cp(path.join(dist, "fonts"), path.join(publicDir, "fonts"), {
    recursive: true,
  });
}

// Emoji URLs are built at runtime, so the SVGs cannot be bundled and must be
// in the public directory. The version stamp skips the copy of ~3700 files
// when the assets are already installed. It lives outside the public directory
// because Vite copies that directory into the build as it is. node_modules is
// the right place for it: an install is what changes the package, and it is
// also what discards the stamp.
//
// The stamp is not enough on its own, because it and the assets sit in
// different places and either one can go without the other. The Docker e2e
// setup keeps node_modules in a volume that outlives the working tree, so a
// `git clean` there removes the assets and leaves the stamp behind. Checking
// the target as well stops a stamp that has outlived its assets from producing
// a build with no emoji in it, which nothing else would report.
async function copyTwemojiAssets(root: string, publicDir: string) {
  const version = packageVersion("@twemoji/svg");
  const target = path.join(publicDir, "twemoji");
  const stamp = path.join(root, "node_modules", ".cache", "twemoji-version");

  const installed = await fs.readFile(stamp, "utf8").catch(() => undefined);
  const present = await fs.stat(target).catch(() => undefined);
  if (installed === version && present) {
    return;
  }

  const source = packageDir("@twemoji/svg");
  await fs.cp(source, target, {
    recursive: true,
    // The package also holds a readme, a license and package.json.
    filter: entry => entry === source || entry.endsWith(".svg"),
  });
  await fs.mkdir(path.dirname(stamp), { recursive: true });
  await fs.writeFile(stamp, version);
}

export function assets(): Plugin {
  return {
    name: "assets",
    // Vitest loads this config too, but does not need the assets.
    apply: () => !process.env.VITEST,
    // The dev server reads the public directory right after the config is
    // resolved, so the assets have to be in place before that.
    async configResolved(config) {
      await copyKatexAssets(config.publicDir);
      await copyTwemojiAssets(config.root, config.publicDir);
    },
  };
}
