import type { Activity } from "./activity";
import type { Repo } from "@app/node/model";

import { rng } from "@app/node/hash";

const DAY = 86400000;
const DAYS = 7 * 53;

// The steady day-to-day work that the seeded repositories don't spell out:
// small commits, comments and reviews. Each person gets a working rhythm
// (how busy they are, weekends, holidays, crunch periods) derived from their
// id, so the result is the same on every boot.
interface Rhythm {
  activeOnWeekday: number;
  activeOnWeekend: number;
  perDay: number;
  breaks: { start: number; length: number }[];
  pushes: { start: number; length: number; factor: number }[];
}

function rhythmFor(person: string): Rhythm {
  const r = rng(`rhythm:${person}`);
  const between = (lo: number, hi: number) => lo + r() * (hi - lo);
  const weekendWorker = r() < 0.25;
  return {
    activeOnWeekday: between(0.45, 0.85),
    activeOnWeekend: weekendWorker ? between(0.35, 0.6) : between(0.03, 0.15),
    perDay: between(0.8, 3.2),
    breaks: Array.from({ length: 1 + Math.floor(r() * 3) }, () => ({
      start: Math.floor(between(0, DAYS - 20)),
      length: Math.floor(between(6, 20)),
    })),
    pushes: Array.from({ length: 2 + Math.floor(r() * 3) }, () => ({
      start: Math.floor(between(0, DAYS - 25)),
      length: Math.floor(between(8, 24)),
      factor: between(1.6, 2.8),
    })),
  };
}

const COMMIT_TEMPLATES = [
  "Fix an edge case in {area}",
  "Tidy up {area}",
  "Add a test for {area}",
  "Document {area}",
  "Simplify {area}",
  "Handle empty input in {area}",
  "Speed up {area}",
  "Fix a typo in {area}",
  "Refactor {area}",
  "Rename helpers in {area}",
  "Bump dependencies",
  "Clean up warnings",
  "Update the changelog",
];

function areasOf(repo: Repo): string[] {
  const head = repo.branches[repo.defaultBranch];
  const files = Object.keys(repo.snapshots[head] ?? {});
  const areas = files
    .map(f => f.split("/").pop()!.replace(/\.[^.]+$/, ""))
    .filter(a => a && !/^(readme|license|changelog|contributing|\.gitignore|index|mod|lib|main)$/i.test(a));
  return areas.length ? [...new Set(areas)] : [repo.name];
}

export function everydayActivity(
  person: string,
  // The repositories this person works in, weighted by how much.
  repos: { repo: Repo; weight: number }[],
  repoPath: (repo: Repo) => string,
  // The moment the node first booted; day 0 is that day.
  epoch: number,
): Activity[] {
  if (repos.length === 0) return [];
  const r = rng(`everyday:${person}`);
  const rhythm = rhythmFor(person);
  const totalWeight = repos.reduce((n, x) => n + x.weight, 0);
  const pickRepo = () => {
    let at = r() * totalWeight;
    for (const x of repos) if ((at -= x.weight) <= 0) return x.repo;
    return repos[0].repo;
  };
  const pick = <T>(items: T[]) => items[Math.floor(r() * items.length)];
  const areas = new Map(repos.map(x => [x.repo.rid, areasOf(x.repo)]));

  const out: Activity[] = [];
  const today = new Date(epoch);
  today.setHours(0, 0, 0, 0);
  for (let ago = 1; ago < DAYS; ago++) {
    const day = DAYS - ago;
    if (rhythm.breaks.some(b => day >= b.start && day < b.start + b.length)) continue;
    const date = new Date(today.getTime() - ago * DAY);
    const weekend = date.getDay() === 0 || date.getDay() === 6;
    const push = rhythm.pushes.find(p => day >= p.start && day < p.start + p.length)?.factor ?? 1;
    // Most people are a little busier lately than a year ago.
    const trend = 0.75 + 0.35 * (day / DAYS);
    const chance = (weekend ? rhythm.activeOnWeekend : rhythm.activeOnWeekday) * Math.min(1.4, push) * trend;
    if (r() > Math.min(0.95, chance)) continue;
    const count = 1 + Math.floor(-Math.log(1 - r()) * rhythm.perDay * push * trend);
    for (let k = 0; k < count; k++) {
      const repo = pickRepo();
      const base = repoPath(repo);
      // Working hours, give or take.
      const time = date.getTime() + (8 + r() * 11) * 3600000;
      const id = `everyday:${person}:${ago}:${k}`;
      const roll = r();
      const openPatches = repo.patches.filter(p => p.time < time);
      const issues = repo.issues.filter(i => i.time < time);
      if (roll < 0.15 && openPatches.length > 0) {
        const p = pick(openPatches);
        out.push({ id, time, kind: "review", repo, title: p.title, href: `${base}/patches/${p.id}`, detail: "reviewed" });
      } else if (roll < 0.35 && issues.length > 0) {
        const i = pick(issues);
        out.push({ id, time, kind: "comment", repo, title: i.title, href: `${base}/issues/${i.id}`, detail: "commented" });
      } else {
        const title = pick(COMMIT_TEMPLATES).replace("{area}", pick(areas.get(repo.rid)!));
        // Not a commit the repository holds, so there is no page to open.
        out.push({ id, time, kind: "commit", repo, title });
      }
    }
  }
  return out;
}
