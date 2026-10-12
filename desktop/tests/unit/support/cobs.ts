import type { Author } from "@bindings/cob/Author";
import type { Operation } from "@bindings/cob/Operation";
import type { Action } from "@bindings/cob/patch/Action";
import type { Review } from "@bindings/cob/patch/Review";
import type { Revision } from "@bindings/cob/patch/Revision";
import type { CodeLocation } from "@bindings/cob/thread/CodeLocation";
import type { Comment } from "@bindings/cob/thread/Comment";
import type { Thread } from "@bindings/cob/thread/Thread";

// Pass `null` for an author without an alias.
export function author(name: string, alias: string | null = name): Author {
  return { did: `did:key:z6Mk${name}`, alias: alias ?? undefined };
}

export function location(
  path: string,
  side: "old" | "new",
  start: number,
  end = start + 1,
): CodeLocation {
  const range = { type: "lines" as const, range: { start, end } };
  return {
    commit: "c".repeat(40),
    path,
    old: side === "old" ? range : null,
    new: side === "new" ? range : null,
  };
}

export function comment(
  props: Partial<Comment<CodeLocation>> & { timestamp?: number } = {},
): Comment<CodeLocation> {
  const { timestamp = 0, ...rest } = props;
  const by = rest.author ?? author("alice");
  return {
    id: "comment",
    author: by,
    edits: [{ author: by, timestamp, body: "body" }],
    reactions: [],
    replyTo: null,
    location: null,
    resolved: false,
    ...rest,
  };
}

export function thread(root: Comment<CodeLocation>): Thread<CodeLocation> {
  return { root, replies: [] };
}

export function review(props: Partial<Review> = {}): Review {
  return {
    id: "review",
    author: author("alice"),
    summary: "",
    comments: [],
    timestamp: 0,
    labels: [],
    ...props,
  };
}

export function revision(props: Partial<Revision> = {}): Revision {
  return {
    id: "revision",
    author: author("alice"),
    description: [],
    base: "b".repeat(40),
    head: "h".repeat(40),
    timestamp: 0,
    ...props,
  };
}

export function operation<A = Action>(
  by: Author,
  timestamp: number,
  actions: A[],
): Operation<A> {
  return { id: `op-${timestamp}`, author: by, timestamp, actions };
}
