import type { ComponentType } from "svelte";

export interface LandingRoute {
  resource: "landing";
  params: undefined;
}

export interface LearnRoute {
  resource: "learn";
  params: undefined;
}

export interface InstallRoute {
  resource: "install";
  params: undefined;
}

export interface GuidesRoute {
  resource: "guides";
  params: undefined;
}

export interface DesktopRoute {
  resource: "desktop";
  params: undefined;
}

export interface CliRoute {
  resource: "cli";
  params: undefined;
}

export interface PrinciplesRoute {
  resource: "principles";
  params: undefined;
}

export type DocsPage = "glossary" | "download";

export interface DocsRoute {
  resource: "docs";
  params: { page: DocsPage };
}

export interface DocsLoadedRoute {
  resource: "docs";
  params: { page: DocsPage; component: ComponentType };
}
