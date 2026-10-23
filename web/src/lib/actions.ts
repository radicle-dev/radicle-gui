import type { IdentityChange, Repo } from "@app/node/model";

import { node } from "@app/node/node.svelte";
import { confirm } from "./confirm.svelte";
import { toast } from "./toast.svelte";

export function setFollow(id: string, on: boolean) {
  node.do({ type: "follow", id, on });
  const org = node.org(id);
  const name = org ? org.handle : `@${node.person(id).alias}`;
  toast(on ? `Following ${name}` : `Unfollowed ${name}`, {
    action: on
      ? undefined
      : { label: "Undo", run: () => node.do({ type: "follow", id, on: true }) },
  });
}

export async function setSeed(repo: Repo, on: boolean) {
  const name = `${node.ownerHandle(repo.owner)}/${repo.name}`;
  if (
    !on &&
    !(await confirm({
      title: `Stop seeding ${name}?`,
      body: "Your node will stop storing it and serving it to peers. You can seed it again later from any peer that has it.",
      confirmLabel: "Stop seeding",
    }))
  ) {
    return;
  }
  node.do({ type: "seed", rid: repo.rid, on });
  toast(on ? `Seeding ${name}` : `Stopped seeding ${name}`, {
    icon: on ? "seed-filled" : "seed",
    action: on
      ? undefined
      : {
          label: "Undo",
          run: () => node.do({ type: "seed", rid: repo.rid, on: true }),
        },
  });
}

export function announceIdentity(repo: Repo, revision: string | undefined, approve: boolean) {
  const state = repo.identity.revisions.find(r => r.id === revision)?.state;
  if (state === "accepted") toast("Identity updated and announced to peers", { icon: "checkmark" });
  else if (state === "rejected") toast("Identity change rejected");
  else if (approve) toast("Signed, waiting for other delegates");
  else toast("Rejection signed");
}

// Proposes one or several changes to a repository's identity as a single
// revision, applied right away when your signature is enough.
export function proposeIdentity(repo: Repo, change: IdentityChange | IdentityChange[], reason = "") {
  const changes = Array.isArray(change) ? change : [change];
  const id = node.do({ type: "idPropose", rid: repo.rid, title: "", description: reason.trim(), changes });
  announceIdentity(repo, id, true);
  return id;
}
