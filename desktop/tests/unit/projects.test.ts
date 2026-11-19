import type { RepoSummary } from "@bindings/repo/RepoSummary";

import { expect, test } from "vitest";

import { projectsOf } from "@app/lib/projects";

function repo(name: string, actor: boolean): RepoSummary {
  return { rid: `rad:${name}`, name, private: false, seeding: true, actor };
}

const repos = [repo("alice", true), repo("heartwood", false)];

test("an actor repository is no project while the lab is on", () => {
  expect(projectsOf(repos, true).map(r => r.name)).toEqual(["heartwood"]);
});

test("every repository is listed while the lab is off", () => {
  expect(projectsOf(repos, false)).toEqual(repos);
});

test("no repositories give no projects", () => {
  expect(projectsOf([], true)).toEqual([]);
});
