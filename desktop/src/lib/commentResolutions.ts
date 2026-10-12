import type { Author } from "@bindings/cob/Author";
import type { Operation } from "@bindings/cob/Operation";
import type { Action } from "@bindings/cob/patch/Action";

export interface Resolution {
  author: Author;
  timestamp: number;
}

/// Who last resolved each comment, taken from the patch's own operation log.
///
/// A `Comment` records only *that* it is resolved: `radicle`'s thread applies the
/// resolve op without keeping hold of its actor, so the comment itself cannot say
/// who. The op that did it is authored, though, so the log still can.
///
/// Unresolving drops the entry again, which is what leaves a comment that was
/// resolved and then reopened without one — matching `resolved: false` on the
/// comment. A revision's `resolves` set is deliberately not read: it records what
/// a revision claims to address and never marks a comment resolved.
export function resolutionsByComment(
  activity: Operation<Action>[],
): Map<string, Resolution> {
  const resolutions = new Map<string, Resolution>();
  for (const op of [...activity].sort((a, b) => a.timestamp - b.timestamp)) {
    for (const action of op.actions) {
      if (action.type === "review.comment.resolve") {
        resolutions.set(action.comment, {
          author: op.author,
          timestamp: op.timestamp,
        });
      } else if (action.type === "review.comment.unresolve") {
        resolutions.delete(action.comment);
      }
    }
  }
  return resolutions;
}
