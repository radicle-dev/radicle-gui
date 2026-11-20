import type { Key } from "./keys";

import { keys } from "./keys";

// Refs that changed in a repository. Without `refs`, the backend doesn't know
// which refs changed, such as when the local user pushed.
export interface RefUpdate {
  rid: string;
  refs?: string[];
}

const ISSUE = "xyz.radicle.issue";
const PATCH = "xyz.radicle.patch";
const JOB = "xyz.radworks.job";

export function affectedKeys({ rid, refs }: RefUpdate): Key[] {
  if (refs === undefined) {
    return [keys.repo(rid)];
  }

  const affected = new Map<string, Key>();
  const add = (key: Key) => affected.set(key.join("\0"), key);

  for (const ref of refs) {
    const name = withoutNamespace(ref);
    const cob = name.match(/^refs\/cobs\/([^/]+)\/([^/]+)$/);

    if (cob && cob[1] === ISSUE) {
      add(keys.issue(rid, cob[2]));
      add(keys.issues(rid));
      add(keys.repoInfo(rid));
    } else if (cob && cob[1] === PATCH) {
      add(keys.patch(rid, cob[2]));
      add(keys.patches(rid));
      add(keys.repoInfo(rid));
    } else if (cob && cob[1] === JOB) {
      // A job names its commit only in its contents, so every job list of
      // the repository is affected.
      add(keys.jobs(rid));
    } else if (/^refs\/(heads|tags)\//.test(name)) {
      add(keys.code(rid));
      add(keys.repoInfo(rid));
    } else if (name === "refs/rad/sigrefs") {
      // Signed refs change along with the refs they sign.
    } else {
      // Identity documents and other COB types can affect anything shown.
      return [keys.repo(rid)];
    }
  }

  return [...affected.values()];
}

function withoutNamespace(ref: string): string {
  return ref.replace(/^refs\/namespaces\/[^/]+\//, "");
}
