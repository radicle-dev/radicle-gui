import storedWritable from "@app/lib/localStore";
import { z } from "zod";

const shareActionSchema = z.enum([
  "openInApp",
  "copyLink",
  "copyId",
  "copyUri",
]);
export type ShareAction = z.infer<typeof shareActionSchema>;

export const shareAction = storedWritable<ShareAction>(
  "shareAction",
  shareActionSchema,
  "copyLink",
  !window.localStorage,
);
