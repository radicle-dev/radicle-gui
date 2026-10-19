import type { Repo } from "@app/node/model";

export interface Activity {
  id: string;
  time: number;
  kind: "commit" | "issue" | "patch" | "review" | "comment" | "release";
  repo: Repo;
  title: string;
  href: string;
  detail?: string;
}

// Everything a person did across the repositories on this node, newest first.
export function activityOf(
  person: string,
  repos: Repo[],
  repoPath: (repo: Repo) => string,
): Activity[] {
  const out: Activity[] = [];
  for (const repo of repos) {
    const base = repoPath(repo);
    for (const c of Object.values(repo.commits)) {
      if (c.author !== person) continue;
      out.push({
        id: c.id,
        time: c.time,
        kind: "commit",
        repo,
        title: c.summary,
        href: `${base}/commit/${c.id}`,
      });
    }
    for (const i of repo.issues) {
      if (i.author === person) {
        out.push({
          id: i.id,
          time: i.time,
          kind: "issue",
          repo,
          title: i.title,
          href: `${base}/issues/${i.id}`,
          detail: "opened an issue",
        });
      }
      for (const c of i.comments) {
        if (c.author !== person) continue;
        out.push({
          id: c.id,
          time: c.time,
          kind: "comment",
          repo,
          title: i.title,
          href: `${base}/issues/${i.id}`,
          detail: "commented",
        });
      }
    }
    for (const p of repo.patches) {
      if (p.author === person) {
        out.push({
          id: p.id,
          time: p.time,
          kind: "patch",
          repo,
          title: p.title,
          href: `${base}/patches/${p.id}`,
          detail: "opened a patch",
        });
      }
      for (const r of p.revisions) {
        for (const v of r.reviews) {
          if (v.author !== person) continue;
          out.push({
            id: v.id,
            time: v.time,
            kind: "review",
            repo,
            title: p.title,
            href: `${base}/patches/${p.id}`,
            detail: v.verdict === "accept" ? "approved" : v.verdict === "reject" ? "requested changes" : "reviewed",
          });
        }
      }
    }
    for (const r of repo.releases) {
      if (r.author !== person) continue;
      out.push({
        id: r.id,
        time: r.time,
        kind: "release",
        repo,
        title: `${r.tag}: ${r.title}`,
        href: `${base}/releases`,
        detail: "published",
      });
    }
  }
  return out.sort((a, b) => b.time - a.time);
}

// Activity counts per day for the last `days` days.
export function heatmap(activity: Activity[], days = 7 * 26): number[] {
  const counts = new Array<number>(days).fill(0);
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  for (const a of activity) {
    const age = Math.floor((today.getTime() - a.time) / 86400000);
    if (age >= 0 && age < days) counts[days - 1 - age]++;
  }
  return counts;
}
