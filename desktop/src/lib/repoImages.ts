import { retinaWidth } from "@app/lib/embeds";
import { invoke } from "@app/lib/invoke";

// Links in a document are resolved against this origin, so that anything
// resolving to another origin is known to point outside the repository. It
// is never requested.
const repoOrigin = "https://repo.radicle.invalid";

export function decodeComponent(component: string): string {
  try {
    return decodeURIComponent(component);
  } catch {
    // A `%` that doesn't start an escape is part of the name.
    return component;
  }
}

/**
 * Resolve a link written relative to the document at `from` into a repository
 * path, which is empty for the repository root, and the fragment it points
 * to. Returns undefined when the link points to another origin. Targets that
 * climb above the root stop at it.
 */
export function resolveRepoTarget(
  href: string,
  from: string,
): { path: string; fragment: string | undefined } | undefined {
  const dir = from.split("/").slice(0, -1).join("/");

  let url: URL;
  try {
    // The trailing slash makes the base a directory, so `a.adoc` resolves as
    // a sibling of `from` rather than replacing its last segment.
    url = new URL(href, `${repoOrigin}/${dir ? `${dir}/` : ""}`);
  } catch {
    return undefined;
  }

  if (url.origin !== repoOrigin) {
    return undefined;
  }

  return {
    path: decodeComponent(url.pathname).replace(/^\//, ""),
    fragment: url.hash ? decodeComponent(url.hash.slice(1)) : undefined,
  };
}

export function resolveRepoPath(
  href: string,
  from: string,
): string | undefined {
  return resolveRepoTarget(href, from)?.path || undefined;
}

// Rewrite GitHub "blob" image URLs so they resolve to the raw image content. A
// URL like https://github.com/<owner>/<repo>/blob/<ref>/<path> serves an HTML
// page rather than the image bytes, so appending `?raw=true` makes GitHub
// redirect to the raw content. URLs already pointing at the raw content are
// returned unchanged.
export function canonicalizeGithubImageUrl(input: string): string {
  let url;
  try {
    url = new URL(input);
  } catch {
    return input;
  }

  if (
    (url.hostname === "github.com" || url.hostname === "www.github.com") &&
    /^\/[^/]+\/[^/]+\/blob\//.test(url.pathname) &&
    url.searchParams.get("raw") !== "true"
  ) {
    url.searchParams.set("raw", "true");
    return url.toString();
  }

  return input;
}

const imageTypes: Record<string, string> = {
  avif: "image/avif",
  bmp: "image/bmp",
  gif: "image/gif",
  ico: "image/x-icon",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  png: "image/png",
  svg: "image/svg+xml",
  webp: "image/webp",
};

// The webview sniffs raster formats, but only shows an SVG when the blob it
// comes from says it is one, so the type comes from the file name.
export function imageMimeType(path: string): string | undefined {
  const extension = /\.([^./]+)$/.exec(path)?.[1].toLowerCase();
  return extension ? imageTypes[extension] : undefined;
}

export interface RepoImage {
  url: string;
  // The width a Retina screenshot is meant to be shown at.
  width: number | undefined;
}

export type FetchRepoBytes = (
  rid: string,
  sha: string,
  path: string,
) => Promise<ArrayBuffer>;

function fetchRepoBytes(rid: string, sha: string, path: string) {
  return invoke<ArrayBuffer>("repo_blob_bytes", { rid, sha, path });
}

/**
 * Loads files out of a repository as images, once per file, and owns the
 * object URLs they are shown through.
 */
export class RepoImages {
  #fetch: FetchRepoBytes;
  #images = new Map<string, Promise<RepoImage | undefined>>();
  #urls = new Map<string, string>();
  #used = new Set<string>();
  #disposed = false;

  constructor(fetch: FetchRepoBytes = fetchRepoBytes) {
    this.#fetch = fetch;
  }

  /**
   * Resolves to undefined when the image was released before it loaded.
   */
  load(rid: string, sha: string, path: string): Promise<RepoImage | undefined> {
    const key = JSON.stringify([rid, sha, path]);
    this.#used.add(key);

    const cached = this.#images.get(key);
    if (cached) {
      return cached;
    }

    const image = this.#fetch(rid, sha, path).then(buffer => {
      const bytes = new Uint8Array(buffer);
      const url = URL.createObjectURL(
        new Blob([bytes], { type: imageMimeType(path) ?? "" }),
      );
      if (this.#images.get(key) !== image) {
        URL.revokeObjectURL(url);
        return undefined;
      }
      this.#urls.set(key, url);
      return { url, width: retinaWidth(bytes) };
    });
    image.catch(() => {
      // A failed load is retried on the next pass rather than cached.
      if (this.#images.get(key) === image) {
        this.#images.delete(key);
      }
    });

    if (!this.#disposed) {
      this.#images.set(key, image);
    }
    return image;
  }

  /**
   * Releases the images not loaded since the previous sweep.
   */
  sweep() {
    for (const key of this.#images.keys()) {
      if (!this.#used.has(key)) {
        this.#release(key);
      }
    }
    this.#used.clear();
  }

  dispose() {
    this.#disposed = true;
    for (const key of this.#images.keys()) {
      this.#release(key);
    }
    this.#used.clear();
  }

  #release(key: string) {
    this.#images.delete(key);
    const url = this.#urls.get(key);
    if (url) {
      URL.revokeObjectURL(url);
      this.#urls.delete(key);
    }
  }
}

// A pass replaces the source of a repository image with an object URL, so the
// source the document was written with is kept here for the next pass.
const sourceAttribute = "data-repo-src";

/**
 * Points the images in `container` at their content: images in the repository
 * are read out of storage, GitHub page URLs are rewritten to the raw file.
 * Repository images need the commit the document is read at, and resolve
 * against the document's `path`.
 */
export function enhanceRepoImages(
  container: HTMLElement,
  source: { rid: string; sha: string | undefined; path: string },
  images: RepoImages,
) {
  for (const image of container.querySelectorAll("img")) {
    if (image.classList.contains("txt-emoji")) {
      continue;
    }

    const src =
      image.getAttribute(sourceAttribute) ?? image.getAttribute("src");
    if (!src) {
      continue;
    }

    const repoPath = resolveRepoPath(src, source.path);
    if (!repoPath) {
      const canonical = canonicalizeGithubImageUrl(src);
      if (canonical !== src) {
        image.setAttribute("src", canonical);
      }
      continue;
    }

    if (!source.sha) {
      continue;
    }

    image.setAttribute(sourceAttribute, src);
    images
      .load(source.rid, source.sha, repoPath)
      .then(loaded => {
        if (!loaded || image.getAttribute(sourceAttribute) !== src) {
          return;
        }
        image.setAttribute("src", loaded.url);
        if (loaded.width && !image.hasAttribute("width")) {
          image.style.width = `${loaded.width}px`;
        } else {
          image.style.removeProperty("width");
        }
      })
      .catch(error => console.warn("Not able to load image", src, error));
  }

  images.sweep();
}
