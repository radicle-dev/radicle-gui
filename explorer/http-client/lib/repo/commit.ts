import type { z } from "zod";
export type {
  Commit,
  CommitHeader,
  Commits,
  Diff,
  DiffContent,
  DiffFile,
  ChangesetWithDiff,
  ChangesetWithoutDiff,
  HunkLine,
  Hunks,
};

import {
  array,
  boolean,
  discriminatedUnion,
  literal,
  number,
  object,
  record,
  string,
  union,
} from "zod";
export {
  commitBlobSchema,
  commitHeaderSchema,
  commitSchema,
  commitsSchema,
  diffBlobSchema,
  diffSchema,
};

const gitPersonSchema = object({
  name: string(),
  email: string(),
});

type CommitHeader = z.infer<typeof commitHeaderSchema>;

const commitHeaderSchema = object({
  id: string(),
  author: gitPersonSchema,
  summary: string(),
  description: string(),
  parents: array(string()),
  committer: gitPersonSchema.merge(object({ time: number() })),
});

const diffBlobSchema = object({
  binary: boolean(),
  content: string(),
  id: string(),
});

export type DiffBlob = z.infer<typeof diffBlobSchema>;

const commitBlobSchema = object({
  binary: boolean(),
  content: string(),
});

export type CommitBlob = z.infer<typeof commitBlobSchema>;

type AdditionHunkLine = z.infer<typeof additionHunkLineSchema>;

const additionHunkLineSchema = object({
  line: string().nullable(),
  lineNo: number(),
  type: literal("addition"),
});

type DeletionHunkLine = z.infer<typeof deletionHunkLineSchema>;

const deletionHunkLineSchema = object({
  line: string().nullable(),
  lineNo: number(),
  type: literal("deletion"),
});

type DiffFile = z.infer<typeof diffFileSchema>;

const diffFileSchema = object({
  oid: string(),
  mode: union([
    literal("blob"),
    literal("blobExecutable"),
    literal("tree"),
    literal("link"),
    literal("commit"),
  ]),
});

type ContextHunkLine = z.infer<typeof contextHunkLineSchema>;

const contextHunkLineSchema = object({
  line: string().nullable(),
  lineNoNew: number(),
  lineNoOld: number(),
  type: literal("context"),
});

type HunkLine = AdditionHunkLine | DeletionHunkLine | ContextHunkLine;

const hunkLineSchema = union([
  additionHunkLineSchema,
  deletionHunkLineSchema,
  contextHunkLineSchema,
]);

type Hunks = z.infer<typeof changesetHunkSchema>;

const changesetHunkSchema = object({
  header: string(),
  lines: array(hunkLineSchema),
});

type DiffContent = z.infer<typeof diffContentSchema>;

const diffContentSchema = discriminatedUnion("type", [
  object({
    type: literal("plain"),
    stats: object({
      additions: number(),
      deletions: number(),
    }),
    hunks: array(changesetHunkSchema),
    eof: union([
      literal("noneMissing"),
      literal("oldMissing"),
      literal("newMissing"),
      literal("bothMissing"),
    ]),
  }),
  object({ type: literal("binary") }),
  object({ type: literal("empty") }),
]);
const diffChangesetSchema = object({
  path: string(),
  diff: diffContentSchema,
});

const diffAddedChangesetSchema = diffChangesetSchema.merge(
  object({ status: literal("added"), new: diffFileSchema }),
);

const diffDeletedChangesetSchema = diffChangesetSchema.merge(
  object({ status: literal("deleted"), old: diffFileSchema }),
);

const diffModifiedChangesetSchema = diffChangesetSchema.merge(
  object({
    status: literal("modified"),
    new: diffFileSchema,
    old: diffFileSchema,
  }),
);

const diffCopiedChangesetSchema = object({
  status: literal("copied"),
  newPath: string(),
  oldPath: string(),
});

const diffCopiedWithModificationsChangesetSchema =
  diffCopiedChangesetSchema.merge(
    object({
      old: diffFileSchema,
      new: diffFileSchema,
      diff: diffContentSchema,
    }),
  );

const diffMovedChangesetSchema = object({
  status: literal("moved"),
  newPath: string(),
  oldPath: string(),
  current: diffFileSchema,
});

const diffMovedWithModificationsChangesetSchema = diffMovedChangesetSchema
  .omit({ current: true })
  .merge(
    object({
      old: diffFileSchema,
      new: diffFileSchema,
      diff: diffContentSchema,
    }),
  );

type Diff = z.infer<typeof diffSchema>;

type ChangesetWithDiff = z.infer<typeof changesetWithDiffSchema>;
type ChangesetWithoutDiff = z.infer<typeof changesetWithoutDiffSchema>;

// eslint-disable-next-line @typescript-eslint/no-unused-vars, no-useless-assignment
const changesetWithDiffSchema = union([
  diffAddedChangesetSchema,
  diffDeletedChangesetSchema,
  diffModifiedChangesetSchema,
  diffMovedWithModificationsChangesetSchema,
  diffCopiedWithModificationsChangesetSchema,
]);
// eslint-disable-next-line @typescript-eslint/no-unused-vars, no-useless-assignment
const changesetWithoutDiffSchema = union([
  diffMovedChangesetSchema,
  diffCopiedChangesetSchema,
]);

const diffSchema = object({
  files: array(
    union([
      diffAddedChangesetSchema,
      diffDeletedChangesetSchema,
      diffModifiedChangesetSchema,
      diffMovedChangesetSchema,
      diffMovedWithModificationsChangesetSchema,
      diffCopiedChangesetSchema,
      diffCopiedWithModificationsChangesetSchema,
    ]),
  ),
  stats: object({
    filesChanged: number(),
    insertions: number(),
    deletions: number(),
  }),
});

type Commit = z.infer<typeof commitSchema>;

const commitSchema = object({
  commit: commitHeaderSchema,
  diff: diffSchema,
  branches: array(string()),
  files: record(string(), commitBlobSchema),
});

type Commits = z.infer<typeof commitsSchema>;

const commitsSchema = array(commitHeaderSchema);
