import type { ComponentProps } from "svelte";

import type Icon from "@app/components/Icon.svelte";

export type ExploreSectionIcon = ComponentProps<Icon>["name"];

export type ExploreSection =
  | {
      kind: "static";
      id: string;
      title: string;
      icon: ExploreSectionIcon;
      rids: string[];
    }
  | {
      kind: "recentlyActive";
      id: string;
      title: string;
      icon: ExploreSectionIcon;
      limit: number;
    }
  | {
      kind: "mostSeeded";
      id: string;
      title: string;
      icon: ExploreSectionIcon;
      limit: number;
    }
  | {
      kind: "pinned";
      id: string;
      title: string;
      icon: ExploreSectionIcon;
      limit: number;
    };

// Sections shown when the seed exposes a working search index.
export const exploreSections: ExploreSection[] = [
  {
    kind: "mostSeeded",
    id: "most-seeded",
    title: "Most seeded repos",
    icon: "seed",
    limit: 9,
  },
  {
    kind: "recentlyActive",
    id: "recently-active",
    title: "Recently active repos",
    icon: "activity",
    limit: 9,
  },
];

// Sections shown when the seed does not expose a search index — avoids
// asking httpd to walk storage to produce sorted/active rankings.
export function fallbackSections(hostname: string): ExploreSection[] {
  return [
    {
      kind: "pinned",
      id: "pinned",
      title: `Pinned on ${hostname}`,
      icon: "pin-hollow",
      limit: 9,
    },
  ];
}
