import { getContext, setContext } from "svelte";

export interface PatchUserActivity {
  isAuthor: boolean;
  isDelegate: boolean;
  revisionCount: number;
  commentCount: number;
  reviewCount: number;
  patchesAuthored: number;
  issuesAuthored: number;
}

export interface PatchActivitySource {
  /// Pure lookup: derives the counts from data already in hand. Safe to call
  /// from a `$derived`.
  resolve: (publicKey: string) => PatchUserActivity | undefined;
  /// Loads the repo-wide figures the lookup needs for `patchesAuthored` and
  /// `issuesAuthored`. Separate from `resolve` because it fetches, and a
  /// `$derived` is no place to start one; call it from an effect when a card
  /// is actually opened.
  prefetch: () => void;
}

const KEY = Symbol("patch-activity-context");

export function setPatchActivitySource(source: PatchActivitySource) {
  setContext(KEY, source);
}

export function getPatchActivitySource(): PatchActivitySource | undefined {
  return getContext(KEY);
}

/// The current source packaged for `mount()`. A comment thread superimposed on a
/// diff is mounted as its own component tree, outside the component hierarchy
/// that set this up, and its author cards would otherwise lose their figures.
export function forwardPatchActivityContext(): Map<unknown, unknown> {
  const context = new Map<unknown, unknown>();
  const source = getPatchActivitySource();
  if (source) {
    context.set(KEY, source);
  }
  return context;
}
