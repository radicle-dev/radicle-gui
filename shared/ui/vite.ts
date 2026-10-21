import type { Plugin } from "vite";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const publicDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "public",
);

const contentTypes: Record<string, string> = {
  ".css": "text/css",
  ".woff2": "font/woff2",
};

// Maps each file's URL path, such as `/fonts/Booton-Regular.woff2`, to its
// location on disk.
function publicFiles(): Map<string, string> {
  return new Map(
    fs
      .readdirSync(publicDir, { recursive: true, withFileTypes: true })
      .filter(entry => entry.isFile())
      .map(entry => {
        const file = path.join(entry.parentPath, entry.name);
        const url = path.relative(publicDir, file).split(path.sep).join("/");
        return [`/${url}`, file];
      }),
  );
}

// Serves shared/ui/public at the root URL, next to the app's own public
// directory: from disk in dev, and copied into the build. An app's public
// directory must not contain files at the same paths; the build fails if it
// does.
export function sharedPublic(): Plugin {
  let files = publicFiles();

  return {
    name: "shared-public",
    configResolved(config) {
      const collisions = [...files.keys()].filter(url =>
        fs.existsSync(path.join(config.publicDir, url)),
      );
      if (collisions.length > 0) {
        throw new Error(
          `${config.publicDir} contains files that shared/ui/public also ` +
            `serves: ${collisions.join(", ")}`,
        );
      }
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        let file;
        try {
          const { pathname } = new URL(req.url ?? "/", "http://localhost");
          file = files.get(decodeURIComponent(pathname));
        } catch {
          // A malformed URL is never one of ours.
        }
        if (!file) {
          next();
          return;
        }
        res.setHeader(
          "Content-Type",
          contentTypes[path.extname(file)] ?? "application/octet-stream",
        );
        fs.createReadStream(file).pipe(res);
      });
      server.watcher.add(publicDir);
      server.watcher.on("all", (event, file) => {
        if (!file.startsWith(publicDir + path.sep)) {
          return;
        }
        if (event === "add" || event === "unlink") {
          files = publicFiles();
        }
        server.ws.send({ type: "full-reload" });
      });
    },
    generateBundle() {
      for (const [url, file] of files) {
        this.emitFile({
          type: "asset",
          fileName: url.slice(1),
          source: fs.readFileSync(file),
        });
      }
    },
  };
}
