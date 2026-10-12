// Expansion state of the file tree's folders, keyed by folder prefix
// (`docs/`, `docs/guides/`). A folder stays open once it was opened by hand
// or held the open file, until it is collapsed by hand. Folders containing
// the open file are always expanded, unless collapsed since navigating to
// that file. `visit` counts navigations, so that coming back to the same file
// expands its folders again.
export interface FolderExpansion {
  opened: Set<string>;
  collapsedOnVisit: Map<string, number>;
}

export interface Location {
  path: string;
  visit: number;
}

function ancestorPrefixes(path: string): string[] {
  const prefixes: string[] = [];
  for (let i = path.indexOf("/"); i !== -1; i = path.indexOf("/", i + 1)) {
    prefixes.push(path.slice(0, i + 1));
  }
  return prefixes;
}

export function openAncestors(state: FolderExpansion, path: string) {
  for (const prefix of ancestorPrefixes(path)) {
    state.opened.add(prefix);
  }
}

export function isFolderExpanded(
  state: FolderExpansion,
  prefix: string,
  location: Location,
): boolean {
  if (state.collapsedOnVisit.get(prefix) === location.visit) return false;
  return state.opened.has(prefix) || location.path.startsWith(prefix);
}

export function toggleFolder(
  state: FolderExpansion,
  prefix: string,
  location: Location,
) {
  if (isFolderExpanded(state, prefix, location)) {
    state.opened.delete(prefix);
    state.collapsedOnVisit.set(prefix, location.visit);
  } else {
    state.opened.add(prefix);
    state.collapsedOnVisit.delete(prefix);
  }
}
