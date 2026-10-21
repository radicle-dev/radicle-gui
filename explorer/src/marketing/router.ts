import type { ComponentType } from "svelte";
import type { DocsLoadedRoute, DocsPage, DocsRoute } from "./types";

export type {
  CliRoute,
  DesktopRoute,
  DocsLoadedRoute,
  DocsPage,
  DocsRoute,
  GuidesRoute,
  InstallRoute,
  LandingRoute,
  LearnRoute,
  PrinciplesRoute,
} from "./types";

// Dynamic imports use static specifiers so Vite can bundle each doc as its own
// chunk. The `.md` files are compiled to Svelte components by mdsvex.
const docsLoaders = new Map<
  DocsPage,
  () => Promise<{ default: ComponentType }>
>([
  ["glossary", () => import("./docs/glossary.md")],
  ["download", () => import("./docs/download.md")],
]);

const docsTitles = new Map<DocsPage, string>([
  ["glossary", "Glossary"],
  ["download", "Download"],
]);

export function docsTitle(page: DocsPage): string[] {
  return [docsTitles.get(page) ?? "Docs", "Radicle"];
}

// Resolve a marketing sub-route from its leading path segment and remainder.
// Gating (only available when `homepage === "landing"`) is enforced by the
// caller in the core router.
export function marketingRoute(
  resource: string,
  segments: string[],
):
  | { resource: "learn"; params: undefined }
  | { resource: "install"; params: undefined }
  | { resource: "guides"; params: undefined }
  | { resource: "desktop"; params: undefined }
  | { resource: "cli"; params: undefined }
  | { resource: "principles"; params: undefined }
  | DocsRoute
  | null {
  switch (resource) {
    case "learn":
      return segments.length === 0
        ? { resource: "learn", params: undefined }
        : null;
    case "install":
      return segments.length === 0
        ? { resource: "install", params: undefined }
        : null;
    case "desktop":
      return segments.length === 0
        ? { resource: "desktop", params: undefined }
        : null;
    case "cli":
      return segments.length === 0
        ? { resource: "cli", params: undefined }
        : null;
    case "principles":
      return segments.length === 0
        ? { resource: "principles", params: undefined }
        : null;
    case "glossary":
    case "download":
      return segments.length === 0
        ? { resource: "docs", params: { page: resource } }
        : null;
    case "guides":
      return segments.length === 0
        ? { resource: "guides", params: undefined }
        : null;
    default:
      return null;
  }
}

export async function loadDocsRoute(
  params: DocsRoute["params"],
): Promise<DocsLoadedRoute> {
  const loader = docsLoaders.get(params.page);
  if (!loader) {
    throw new Error(`Unknown docs page: ${params.page}`);
  }
  const mod = await loader();
  return {
    resource: "docs",
    params: { page: params.page, component: mod.default },
  };
}
