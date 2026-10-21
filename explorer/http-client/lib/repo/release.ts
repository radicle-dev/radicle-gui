import type { ZodSchema } from "zod";
import * as z from "zod";

import { authorSchema } from "../shared.js";

export const locationSchema = z.object({
  user: authorSchema,
  url: z.string(),
});

export type Location = z.infer<typeof locationSchema>;

export const redactionSchema = z.object({
  user: authorSchema,
  reason: z.string(),
});

export type Redaction = z.infer<typeof redactionSchema>;

export const artifactSchema = z.object({
  cid: z.string(),
  name: z.string(),
  author: authorSchema,
  locations: z.array(locationSchema),
  attestations: z.array(authorSchema),
  redactions: z.array(redactionSchema),
  metadata: z.record(z.string(), z.unknown()),
});

export type Artifact = z.infer<typeof artifactSchema>;

// A release is keyed by a commit (optionally an annotated tag). It has no
// title field of its own; `title`/`tagName` are resolved by the backend from
// the tag or commit message, and are absent when unresolvable.
export const releaseSchema = z.object({
  id: z.string(),
  oid: z.string(),
  tag: z.string().nullish(),
  tagName: z.string().nullish(),
  title: z.string().nullish(),
  createdAt: z.number(),
  creator: authorSchema,
  artifacts: z.array(artifactSchema),
});

export type Release = z.infer<typeof releaseSchema>;

export const releasesSchema = z.array(releaseSchema) satisfies ZodSchema<
  Release[]
>;
