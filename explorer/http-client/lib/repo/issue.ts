import type { ZodSchema } from "zod";
import * as z from "zod";

import { commentSchema } from "./comment.js";
import { authorSchema } from "../shared.js";

export type IssueState =
  { status: "open" } | { status: "closed"; reason: "other" | "solved" };

const issueStateSchema = z.union([
  z.object({ status: z.literal("open") }),
  z.object({
    status: z.literal("closed"),
    reason: z.union([z.literal("other"), z.literal("solved")]),
  }),
]) satisfies ZodSchema<IssueState>;

export const issueSchema = z.object({
  id: z.string(),
  author: authorSchema,
  title: z.string(),
  state: issueStateSchema,
  discussion: z.array(commentSchema),
  labels: z.array(z.string()),
  assignees: z.array(authorSchema),
});

export type Issue = z.infer<typeof issueSchema>;

export const issuesSchema = z.array(issueSchema) satisfies ZodSchema<Issue[]>;
