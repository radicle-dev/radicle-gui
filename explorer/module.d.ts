declare module "*.md" {
  import type { ComponentType } from "svelte";
  const component: ComponentType;
  export default component;
}

declare const buildTimeConfig: {
  nodes: {
    requiredApiVersion: string;
    fallbackPublicExplorer: string;
    defaultHttpdPort: number;
    defaultLocalHttpdPort: number;
    defaultHttpdScheme: string;
    homepage: "node" | "landing";
  };
  source: {
    commitsPerPage: number;
  };
  deploymentId: string | null;
  reactions: string[];
  supportWebsite: string;
  preferredSeeds: BaseUrl[];
};
