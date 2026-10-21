import * as z from "zod";

export const scopeSchema = z.union([z.literal("followed"), z.literal("all")]);

export const seedingPolicySchema = z.union([
  z.object({
    policy: z.literal("block"),
  }),
  z.object({
    policy: z.literal("allow"),
    scope: scopeSchema,
  }),
]);

export type SeedingPolicy = z.infer<typeof seedingPolicySchema>;

const defaultSeedingPolicySchema = z.union([
  z.object({
    default: z.literal("block"),
  }),
  z.object({
    default: z.literal("allow"),
    scope: scopeSchema.optional(),
  }),
]);

export const nodeConfigSchema = z.object({
  alias: z.string(),
  peers: z.union([
    z.object({ type: z.literal("static") }),
    z.object({ type: z.literal("dynamic") }),
  ]),
  listen: z.array(z.string()),
  connect: z.array(z.string()),
  externalAddresses: z.array(z.string()),
  proxy: z.string().optional(),
  onion: z
    .union([
      z.object({
        mode: z.literal("proxy"),
        address: z.string(),
      }),
      z.object({ mode: z.literal("forward") }),
    ])
    .optional(),
  log: z.union([
    z.literal("ERROR"),
    z.literal("WARN"),
    z.literal("INFO"),
    z.literal("DEBUG"),
    z.literal("TRACE"),
  ]),
  network: z.union([z.literal("main"), z.literal("test")]),
  relay: z.union([z.literal("always"), z.literal("never"), z.literal("auto")]),
  limits: z.object({
    routingMaxSize: z.number(),
    routingMaxAge: z.number(),
    fetchConcurrency: z.number(),
    gossipMaxAge: z.number(),
    maxOpenFiles: z.number(),
    rate: z.object({
      inbound: z.object({
        fillRate: z.number(),
        capacity: z.number(),
      }),
      outbound: z.object({
        fillRate: z.number(),
        capacity: z.number(),
      }),
    }),
    connection: z.object({
      inbound: z.number(),
      outbound: z.number(),
    }),
  }),
  workers: z.number(),
  seedingPolicy: defaultSeedingPolicySchema,
});

export type DefaultSeedingPolicy = z.infer<typeof defaultSeedingPolicySchema>;

export const configSchema = z.object({
  publicExplorer: z.string(),
  preferredSeeds: z.array(z.string()),
  cli: z.object({ hints: z.boolean() }),
  web: z.object({
    pinned: z.object({
      repositories: z.array(z.string()),
    }),
    bannerUrl: z.string().optional(),
    avatarUrl: z.string().optional(),
    description: z.string().optional(),
  }),
  node: nodeConfigSchema,
});

export type Config = z.infer<typeof configSchema>;

export const rangeSchema = z.union([
  z.object({
    type: z.literal("lines"),
    range: z.object({ start: z.number(), end: z.number() }),
  }),
  z.object({
    type: z.literal("chars"),
    line: z.number(),
    range: z.object({ start: z.number(), end: z.number() }),
  }),
]);

export type Range = z.infer<typeof rangeSchema>;

export const codeLocationSchema = z.object({
  commit: z.string(),
  path: z.string(),
  old: rangeSchema.optional(),
  new: rangeSchema.optional(),
});

export type Author = z.infer<typeof authorSchema>;

export const authorSchema = z.object({
  id: z.string(),
  alias: z.string().optional(),
});
