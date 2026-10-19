import type { OrgSeed } from "./types";

// Fictional organisations on the simulated network.
export const orgs: OrgSeed[] = [
  {
    key: "lumen-labs",
    handle: "lumen-labs",
    name: "Lumen Labs",
    description:
      "A small, remote team building peer-to-peer networking libraries: discovery, gossip and signed announcements without a central server.",
    website: "https://lumenlabs.example.org",
    location: "Distributed",
    members: [
      { person: "self", role: "admin" },
      { person: "ada", role: "admin" },
      { person: "tomas", role: "admin" },
      { person: "yuki", role: "member" },
      { person: "kofi", role: "member" },
    ],
    threshold: 2,
    selfMember: true,
  },
  {
    key: "fieldwork-studio",
    handle: "fieldwork",
    name: "Fieldwork Studio",
    description:
      "Design-engineering studio. We make Atlas, an accessible, themeable UI component library, and the tools around it.",
    website: "https://fieldwork.example.studio",
    location: "Bergen & Leipzig",
    members: [
      { person: "mira", role: "admin" },
      { person: "lena", role: "admin" },
      { person: "self", role: "member" },
      { person: "yuki", role: "member" },
    ],
    threshold: 2,
    selfMember: true,
  },
  {
    key: "tidal-collective",
    handle: "tidal",
    name: "Tidal Collective",
    description:
      "Nonprofit collecting open ocean and coastal sensor data, and running the services that keep it public, versioned and free.",
    website: "https://tidal.example.org",
    location: "Valparaíso, Chile",
    members: [
      { person: "sol", role: "admin" },
      { person: "kofi", role: "admin" },
      { person: "oskar", role: "member" },
    ],
    threshold: 2,
    selfMember: false,
  },
];
