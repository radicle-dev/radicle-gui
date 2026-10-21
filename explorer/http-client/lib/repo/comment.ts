import * as z from "zod";
import { authorSchema, codeLocationSchema } from "../shared";

export type Comment = z.infer<typeof commentSchema>;
export type Embed = Comment["embeds"][0];
export type Reaction = Comment["reactions"][0];

export const commentSchema = z.object({
  id: z.string(),
  author: authorSchema,
  body: z.string(),
  edits: z.array(
    z.object({
      author: authorSchema,
      body: z.string(),
      embeds: z.array(z.object({ name: z.string(), content: z.string() })),
      timestamp: z.number(),
    }),
  ),
  embeds: z.array(z.object({ name: z.string(), content: z.string() })),
  reactions: z.array(
    z.object({ emoji: z.string(), authors: z.array(authorSchema) }),
  ),
  timestamp: z.number(),
  location: codeLocationSchema.nullable().optional(),
  resolved: z.boolean(),
  replyTo: z.string().nullable(),
});
