import type { ZodSchema, z } from "zod";

import { commentSchema } from "./comment.js";

import {
  array,
  literal,
  number,
  optional,
  object,
  string,
  tuple,
  union,
} from "zod";
import { authorSchema } from "../shared.js";

export type PatchState = z.infer<typeof patchStateSchema>;

const patchStateSchema = union([
  object({
    status: literal("draft"),
  }),
  object({
    status: literal("open"),
    conflicts: array(tuple([string(), string()])).optional(),
  }),
  object({
    status: literal("archived"),
  }),
  object({
    status: literal("merged"),
    revision: string(),
    commit: string(),
  }),
]);

export type MergeTarget = z.infer<typeof mergeTargetSchema>;

const mergeTargetSchema = union([
  literal("delegates"),
  object({ branch: string() }),
]);

export type Merge = z.infer<typeof mergeSchema>;

const mergeSchema = object({
  author: authorSchema,
  revision: string(),
  commit: string(),
  timestamp: number(),
});

export type Verdict = "accept" | "reject";

const reviewSchema = object({
  author: authorSchema,
  id: string(),
  verdict: optional(union([literal("accept"), literal("reject")]).nullable()),
  comments: array(commentSchema),
  summary: string().nullable(),
  timestamp: number(),
});

export type Review = z.infer<typeof reviewSchema>;

const revisionSchema = object({
  id: string(),
  author: authorSchema,
  description: string(),
  edits: array(
    object({
      author: authorSchema,
      body: string(),
      embeds: array(object({ name: string(), content: string() })),
      timestamp: number(),
    }),
  ),
  reactions: array(
    object({
      emoji: string(),
      authors: array(authorSchema),
    }),
  ),
  base: string(),
  oid: string(),
  refs: array(string()),
  discussions: array(commentSchema),
  reviews: array(reviewSchema),
  timestamp: number(),
});

export type Revision = z.infer<typeof revisionSchema>;

export const patchSchema = object({
  id: string(),
  author: authorSchema,
  title: string(),
  state: patchStateSchema,
  target: mergeTargetSchema,
  labels: array(string()),
  merges: array(mergeSchema),
  assignees: array(authorSchema),
  revisions: array(revisionSchema),
});

export type Patch = z.infer<typeof patchSchema>;

export const patchesSchema = array(patchSchema) satisfies ZodSchema<Patch[]>;

export type LifecycleState =
  { status: "draft" } | { status: "open" } | { status: "archived" };
