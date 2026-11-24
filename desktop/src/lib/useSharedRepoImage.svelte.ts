import type { ActorProfile } from "@bindings/actor/ActorProfile";

import { untrack } from "svelte";

import { fetchRepoBytes, repoImageUrl } from "@app/lib/repoImages";

// A file in a repository at one commit.
export interface RepoFile {
  rid: string;
  sha: string;
  path: string;
}

// The picture a profile keeps in its repository under `field`, as the file
// to read. Undefined when there is none to read: no profile, no commit it was
// read from, no picture, or a picture kept at a web address, which has a
// colon in it and is never fetched, since that would tell its host who is
// looking.
export function pictureFile(
  actor:
    | {
        rid: string;
        head?: string;
        profile?: Pick<ActorProfile, "avatar" | "banner">;
      }
    | null
    | undefined,
  field: "avatar" | "banner",
): RepoFile | undefined {
  const path = actor?.profile?.[field]?.trim();
  if (!actor?.head || !path || path.includes(":")) return undefined;

  return { rid: actor.rid, sha: actor.head, path };
}

interface Entry {
  users: number;
  // Settles once the file is read, with its object URL, or with nothing when
  // the read failed.
  loading: Promise<string | undefined>;
  settled: boolean;
  url?: string;
  release?: ReturnType<typeof setTimeout>;
}

// How long a picture nothing shows any more is kept, so that rows scrolled
// out and back in, or a list drawn again, do not read it again. A failed
// read is kept the same way, so that the rows sharing it ask and warn once.
// It is tried again only once nothing has shown it for this long: a picture
// that something always shows, such as the user's own in the sidebar, stays
// failed until its profile moves to another commit.
const KEEP_MS = 30_000;

// eslint-disable-next-line svelte/prefer-svelte-reactivity -- never rendered
const entries = new Map<string, Entry>();

function keyOf({ rid, sha, path }: RepoFile): string {
  return JSON.stringify([rid, sha, path]);
}

function acquire(file: RepoFile): Entry {
  const key = keyOf(file);
  let entry = entries.get(key);

  if (!entry) {
    const created: Entry = {
      users: 0,
      settled: false,
      loading: fetchRepoBytes(file.rid, file.sha, file.path)
        .then(bytes => {
          created.url = repoImageUrl(bytes, file.path);
        })
        .catch((error: unknown) => {
          console.warn("Not able to load a picture from a repository", error);
        })
        .then(() => {
          created.settled = true;
          return created.url;
        }),
    };
    entries.set(key, created);
    entry = created;
  }

  clearTimeout(entry.release);
  entry.release = undefined;
  entry.users += 1;

  return entry;
}

function release(file: RepoFile, entry: Entry): void {
  entry.users -= 1;
  if (entry.users > 0) return;

  const key = keyOf(file);
  entry.release = setTimeout(() => {
    if (entries.get(key) === entry) entries.delete(key);
    void entry.loading.then(url => {
      if (url !== undefined) URL.revokeObjectURL(url);
    });
  }, KEEP_MS);
}

export interface SharedRepoImage {
  // The object URL of the picture, once it has loaded. A picture another
  // component loaded already is there from the first render.
  readonly url: string | undefined;
  // The picture could not be read.
  readonly failed: boolean;
}

// The file `file` names as a picture, read once for all the components that
// show it and kept while any of them does: the read costs a backend call and
// holds the whole file in memory, which the backend caps at 10 MiB. When
// `file` changes to another commit or path of the same repository, the
// picture shown stays until the next has loaded. A read that failed is
// logged once, however many components asked, and is not tried again while
// any of them still shows the file. Create it during component
// initialisation.
export function useSharedRepoImage(
  file: () => RepoFile | undefined,
): SharedRepoImage {
  const first = untrack(file);
  const known = first && entries.get(keyOf(first));
  let url = $state(known?.url);
  let failed = $state(Boolean(known?.settled && known.url === undefined));
  let shownOf = first?.rid;

  $effect(() => {
    const wanted = file();
    if (!wanted) {
      shownOf = undefined;
      url = undefined;
      failed = false;
      return;
    }

    const entry = acquire(wanted);
    if (entry.settled || wanted.rid !== shownOf) {
      url = entry.url;
    }
    shownOf = wanted.rid;
    failed = entry.settled && entry.url === undefined;

    let gone = false;
    void entry.loading.then(loaded => {
      if (gone) return;
      url = loaded;
      failed = loaded === undefined;
    });

    return () => {
      gone = true;
      release(wanted, entry);
    };
  });

  return {
    get url() {
      return url;
    },
    get failed() {
      return failed;
    },
  };
}
