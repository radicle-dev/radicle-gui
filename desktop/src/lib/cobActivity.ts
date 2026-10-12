import type { Author } from "@bindings/cob/Author";
import type { Operation } from "@bindings/cob/Operation";

export interface ActivityItem<T = unknown> {
  key: string;
  timestamp: number;
  data: T;
  /// Renders as a card or a filled band rather than a bare row of text.
  /// Grouped rows are packed tight against each other, which reads as one
  /// element when the things being packed have their own edges, so these are
  /// never folded into a run.
  standalone?: boolean;
}

/// One action of an operation, with the operation's metadata and the previous
/// action of the same type, which the timeline diffs against.
export type FlattenedAction<A> = A & {
  id: string;
  author: Author;
  timestamp: number;
  previous?: A;
};

/// What was added and removed between two lists. Items are compared by `key`,
/// since objects such as assignees are never the same instance twice.
export function itemDiff<T>(
  previous: T[],
  next: T[],
  key: (item: T) => unknown = item => item,
) {
  const previousKeys = new Set(previous.map(key));
  const nextKeys = new Set(next.map(key));
  return {
    removed: previous.filter(x => !nextKeys.has(key(x))),
    added: next.filter(x => !previousKeys.has(key(x))),
  };
}

function labelsOf(action: { type: string }): string[] | undefined {
  if (action.type !== "label" || !("labels" in action)) return undefined;
  return action.labels as string[];
}

/// Turn a COB's operations into one timeline entry per action, dropping the
/// actions that would render nothing:
///
/// - types in `skip`, which the timeline shows elsewhere or not at all;
/// - the first `edit`, since there is nothing to diff it against;
/// - a `label` action that neither adds nor removes a label.
///
/// Skipped actions still count as the previous action of their type.
/// `onSkipped` sees each action in `skip` and `onKept` each entry as it is
/// made, both in operation order, so a caller can fold edits into the entries
/// they belong to.
export function flattenActivity<A extends { type: string }>(
  activity: Operation<A>[],
  options: {
    skip: ReadonlySet<A["type"]>;
    onSkipped?: (action: A) => void;
    onKept?: (op: FlattenedAction<A>) => void;
  },
): ActivityItem<FlattenedAction<A>>[] {
  const previousByType = new Map<A["type"], A>();
  const items: ActivityItem<FlattenedAction<A>>[] = [];

  for (const operation of activity) {
    operation.actions.forEach((action, actionIndex) => {
      const previous = previousByType.get(action.type);
      previousByType.set(action.type, action);

      if (options.skip.has(action.type)) {
        options.onSkipped?.(action);
        return;
      }
      if (action.type === "edit" && !previous) {
        return;
      }
      const labels = labelsOf(action);
      if (labels) {
        const { added, removed } = itemDiff(
          (previous && labelsOf(previous)) ?? [],
          labels,
        );
        if (added.length === 0 && removed.length === 0) {
          return;
        }
      }

      const op: FlattenedAction<A> = {
        ...action,
        id: operation.id,
        author: operation.author,
        timestamp: operation.timestamp,
        previous,
      };
      options.onKept?.(op);
      items.push({
        key: `${operation.id}:${actionIndex}`,
        timestamp: operation.timestamp,
        data: op,
      });
    });
  }
  return items;
}
