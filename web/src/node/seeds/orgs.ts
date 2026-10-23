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
  {
    key: "meshwork",
    handle: "meshwork",
    name: "Meshwork",
    description:
      "Volunteers running community mesh networks, and the routing daemon and map that keep them working.",
    website: "https://meshwork.example.net",
    location: "Cusco, Lyon & Umeå",
    members: [
      { person: "diego", role: "admin" },
      { person: "felix", role: "admin" },
      { person: "oskar", role: "member" },
      { person: "noor", role: "member" },
    ],
    threshold: 2,
    selfMember: false,
  },
  {
    key: "quill",
    handle: "quill",
    name: "Quill",
    description: "Open tools for people who write: a prose linter, a typesetter and the style rules behind them.",
    website: "https://quill.example.org",
    location: "Hamburg & Edinburgh",
    members: [
      { person: "jonas", role: "admin" },
      { person: "wren", role: "admin" },
      { person: "lena", role: "member" },
      { person: "priya", role: "member" },
    ],
    threshold: 2,
    selfMember: false,
  },
  {
    key: "keystone",
    handle: "keystone",
    name: "Keystone",
    description:
      "Small, audited cryptography libraries, and the public audit reports that go with them.",
    website: "https://keystone.example.org",
    location: "Distributed",
    members: [
      { person: "zeynep", role: "admin" },
      { person: "malik", role: "admin" },
      { person: "tomas", role: "member" },
      { person: "theo", role: "member" },
    ],
    threshold: 3,
    selfMember: false,
  },
  {
    key: "verdant",
    handle: "verdant",
    name: "Verdant",
    description:
      "Open soil and crop data for smallholder farmers: sensors, pipelines and a planting calendar anyone can query.",
    website: "https://verdant.example.org",
    location: "Enugu & Porto",
    members: [
      { person: "amara", role: "admin" },
      { person: "ines", role: "admin" },
      { person: "hana", role: "member" },
      { person: "sol", role: "member" },
    ],
    threshold: 2,
    selfMember: false,
  },
];
