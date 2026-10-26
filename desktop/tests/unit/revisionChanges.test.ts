import type { Commit } from "@bindings/repo/Commit";

import { describe, expect, test } from "vitest";

import {
  revisionChanges,
  revisionChangeTooltip,
} from "@app/lib/revisionChanges";
import { truncateDid } from "@app/lib/utils";

import { author } from "./support/cobs";

describe("revisionChanges", () => {
  const c = (id: string) => ({ id }) as Commit;
  const alice = author("alice");
  const bob = author("bob");
  const rev = (id: string, base: string, head: string, by = alice) => ({
    id,
    base,
    head,
    author: by,
  });

  // One patch, five revisions: three commits, the top one amended, a rebase
  // onto a newer master, a fourth commit added, the top two dropped.
  const patch = [
    rev("r1", "m2", "a3"),
    rev("r2", "m2", "a3'"),
    rev("r3", "m3", "a3''"),
    rev("r4", "m3", "a4"),
    rev("r5", "m3", "a2''"),
  ];
  const patchCommits: Record<string, Commit[]> = {
    r1: [c("a1"), c("a2"), c("a3")],
    r2: [c("a1"), c("a2"), c("a3'")],
    r3: [c("a1''"), c("a2''"), c("a3''")],
    r4: [c("a1''"), c("a2''"), c("a3''"), c("a4")],
    r5: [c("a1''"), c("a2''")],
  };

  test("states what each revision has that the previous one has not, and the reverse", () => {
    const changes = revisionChanges(patch, id => patchCommits[id]);
    expect(changes.r1).toEqual({
      kind: "first",
      totalCommits: 3,
      newCommits: 3,
      goneCommits: 0,
      baseMoved: false,
      base: "m2",
    });
    expect(changes.r2).toMatchObject({
      kind: "newAndGone",
      previousNumber: 1,
      newCommits: 1,
      goneCommits: 1,
      baseMoved: false,
    });
    expect(changes.r3).toMatchObject({
      kind: "noneShared",
      previousNumber: 2,
      newCommits: 3,
      goneCommits: 3,
      baseMoved: true,
      base: "m3",
    });
    expect(changes.r4).toMatchObject({
      kind: "onlyNew",
      previousNumber: 3,
      newCommits: 1,
      goneCommits: 0,
    });
    expect(changes.r5).toMatchObject({
      kind: "onlyGone",
      previousNumber: 4,
      newCommits: 0,
      goneCommits: 2,
    });
    expect(Object.values(changes).map(ch => ch.totalCommits)).toEqual([
      3, 3, 3, 4, 2,
    ]);
    // No author is named while every revision is the same person's.
    expect(Object.values(changes).some(ch => "previousAuthor" in ch)).toBe(
      false,
    );
  });

  test("tooltips name the facts and the previous revision", () => {
    const changes = revisionChanges(patch, id => patchCommits[id]);
    expect(revisionChangeTooltip(changes.r1)).toBe("First revision, 3 commits");
    expect(revisionChangeTooltip(changes.r2)).toBe(
      "1 new, 1 gone since r1, 3 commits in total",
    );
    expect(revisionChangeTooltip(changes.r3)).toBe(
      "3 commits, none in common with the 3 in r2, new base m3",
    );
    expect(revisionChangeTooltip(changes.r4)).toBe(
      "1 new since r3, 4 commits in total",
    );
    expect(revisionChangeTooltip(changes.r5)).toBe(
      "2 gone since r4, 2 commits remain",
    );
  });

  test("a diff hash says whether the same lines changed", () => {
    const prints: Record<string, string | undefined> = {
      r1: "p",
      r2: "p",
      r3: "q",
      r4: undefined,
    };
    const changes = revisionChanges(
      patch.slice(0, 4),
      id => patchCommits[id],
      id => prints[id],
    );
    expect(revisionChangeTooltip(changes.r2)).toBe(
      "Same changed lines as r1. 1 of 3 commits has a new id, 1 gone",
    );
    expect(revisionChangeTooltip(changes.r3)).toBe(
      "Changed lines differ from r2. 3 commits, none in common with the 3 in r2, new base m3",
    );
    // A diff hash known for only one of the two revisions says nothing.
    expect(changes.r4).not.toHaveProperty("sameLines");
    expect(revisionChangeTooltip(changes.r4)).toBe(
      "1 new since r3, 4 commits in total",
    );
  });

  test("a squash states both counts", () => {
    const changes = revisionChanges(
      [rev("r1", "m", "a3"), rev("r2", "m", "s")],
      id => (id === "r1" ? [c("a1"), c("a2"), c("a3")] : [c("s")]),
      () => "p",
    );
    expect(changes.r2).toMatchObject({
      kind: "noneShared",
      newCommits: 1,
      goneCommits: 3,
      baseMoved: false,
    });
    expect(revisionChangeTooltip(changes.r2)).toBe(
      "Same changed lines as r1. 1 commit, none in common with the 3 in r1",
    );
  });

  test("the same head pushed again, and one commit remaining, read in the singular", () => {
    const same = revisionChanges(
      [rev("r1", "m", "a1"), rev("r2", "m", "a1")],
      () => [c("a1")],
    );
    expect(same.r2).toMatchObject({ kind: "sameHead", previousNumber: 1 });
    expect(revisionChangeTooltip(same.r2)).toBe("Same head as r1, 1 commit");

    const gone = revisionChanges(
      [rev("r1", "m", "a3"), rev("r2", "m", "a1")],
      id => (id === "r1" ? [c("a1"), c("a2"), c("a3")] : [c("a1")]),
    );
    expect(revisionChangeTooltip(gone.r2)).toBe(
      "2 gone since r1, 1 commit remains",
    );
  });

  test("a base that moved under surviving commits is named, not called a rebase", () => {
    // The bottom commit landed upstream; a fourth was added on top.
    const changes = revisionChanges(
      [rev("r1", "m", "a3"), rev("r2", "a1", "a4")],
      id =>
        id === "r1" ? [c("a1"), c("a2"), c("a3")] : [c("a2"), c("a3"), c("a4")],
    );
    expect(changes.r2).toMatchObject({
      kind: "newAndGone",
      newCommits: 1,
      goneCommits: 1,
      baseMoved: true,
    });
    expect(revisionChangeTooltip(changes.r2)).toBe(
      "1 new, 1 gone since r1, 3 commits in total, base now a1",
    );
  });

  test("another author's previous revision is named", () => {
    // Alice opens, Bob pushes unrelated commits, Alice adds one to her own.
    const list = [
      rev("a1", "m", "x3"),
      rev("b1", "m", "y1", bob),
      rev("a2", "m", "x4"),
    ];
    const commits: Record<string, Commit[]> = {
      a1: [c("x1"), c("x2"), c("x3")],
      b1: [c("y1")],
      a2: [c("x1"), c("x2"), c("x3"), c("x4")],
    };
    const changes = revisionChanges(list, id => commits[id]);
    expect(changes.b1).toMatchObject({
      kind: "noneShared",
      previousAuthor: alice,
    });
    expect(revisionChangeTooltip(changes.b1)).toBe(
      "1 commit, none in common with the 3 in r1 by alice",
    );
    expect(changes.a2).toMatchObject({
      kind: "noneShared",
      previousAuthor: bob,
    });
    expect(revisionChangeTooltip(changes.a2)).toBe(
      "4 commits, none in common with the 1 in r2 by bob",
    );

    // Two people with the same alias are told apart by the did.
    const twin = author("alice");
    twin.did = "did:key:z6MkTwinTwinTwinTwinTwinTwinTwinTwinTwinTwinTwinTwin";
    const twins = revisionChanges(
      [rev("a1", "m", "x3", twin), rev("a2", "m", "x4")],
      id => commits[id],
    );
    expect(revisionChangeTooltip(twins.a2)).toBe(
      `1 new since r1 by ${truncateDid(twin.did)}, 4 commits in total`,
    );

    // Alice continues from Bob's commits instead.
    const onB: Record<string, Commit[]> = {
      ...commits,
      a2: [c("y1"), c("x5")],
    };
    expect(revisionChangeTooltip(revisionChanges(list, id => onB[id]).a2)).toBe(
      "1 new since r2 by bob, 2 commits in total",
    );
  });

  test("a revision whose commits did not load gets no entry, and only the next is not compared", () => {
    const changes = revisionChanges(patch.slice(0, 4), id =>
      id === "r2" ? undefined : patchCommits[id],
    );
    expect(changes.r2).toBeUndefined();
    expect(changes.r3).toMatchObject({
      kind: "previousNotLoaded",
      totalCommits: 3,
    });
    expect(changes.r3).not.toHaveProperty("previousNumber");
    expect(revisionChangeTooltip(changes.r3)).toBeUndefined();
    expect(revisionChangeTooltip(changes.r4)).toBe(
      "1 new since r3, 4 commits in total",
    );
  });

  test("a revision with nothing earlier loaded says so instead of claiming to be first", () => {
    const changes = revisionChanges(patch.slice(0, 3), id =>
      id === "r1" ? undefined : patchCommits[id],
    );
    expect(changes.r1).toBeUndefined();
    expect(changes.r2).toMatchObject({
      kind: "previousNotLoaded",
      totalCommits: 3,
    });
    expect(revisionChangeTooltip(changes.r2)).toBeUndefined();
    expect(changes.r3).toMatchObject({
      kind: "noneShared",
      previousNumber: 2,
    });
  });

  test("commits on top of an empty revision are new", () => {
    const changes = revisionChanges(
      [rev("r1", "m", "m"), rev("r2", "m", "a1")],
      id => (id === "r1" ? [] : [c("a1")]),
    );
    expect(changes.r2).toMatchObject({ kind: "onlyNew", newCommits: 1 });
  });

  test("the same head pushed again names a moved base and another author", () => {
    const changes = revisionChanges(
      [
        rev("r1", "m1", "a1"),
        rev("r2", "m2", "a1"),
        rev("r3", "m2", "a1", bob),
      ],
      () => [c("a1")],
    );
    expect(revisionChangeTooltip(changes.r2)).toBe(
      "Same head as r1, 1 commit, base now m2",
    );
    expect(revisionChangeTooltip(changes.r3)).toBe(
      "Same head as r2 by alice, 1 commit",
    );
  });

  test("gone commits on a moved base, and every commit gone", () => {
    const moved = revisionChanges(
      [rev("r1", "m", "a3"), rev("r2", "a1", "a2")],
      id => (id === "r1" ? [c("a1"), c("a2"), c("a3")] : [c("a2")]),
    );
    expect(revisionChangeTooltip(moved.r2)).toBe(
      "2 gone since r1, 1 commit remains, base now a1",
    );

    const all = revisionChanges(
      [rev("r1", "m", "a2"), rev("r2", "m", "m")],
      id => (id === "r1" ? [c("a1"), c("a2")] : []),
    );
    expect(revisionChangeTooltip(all.r2)).toBe(
      "2 gone since r1, 0 commits remain",
    );
  });

  test("the lines lead the tooltip when known, then the counts and the base", () => {
    const changes = revisionChanges(
      [rev("r1", "m", "a3"), rev("r2", "a1", "a4"), rev("r3", "m2", "a5")],
      id =>
        ({
          r1: [c("a1"), c("a2"), c("a3")],
          r2: [c("a2"), c("a3"), c("a4")],
          r3: [c("a2"), c("a3"), c("a4"), c("a5")],
        })[id],
      id => (id === "r1" ? "p" : "q"),
    );
    expect(revisionChangeTooltip(changes.r2)).toBe(
      "Changed lines differ from r1. 1 new, 1 gone, 3 commits in total, base now a1",
    );
    // New commits alone never carry the lines clause.
    expect(changes.r3).toMatchObject({ kind: "onlyNew", sameLines: true });
    expect(revisionChangeTooltip(changes.r3)).toBe(
      "1 new since r2, 4 commits in total, base now m2",
    );
  });

  test("an author without an alias is named by the did", () => {
    const nobody = author("nobody", null);
    const changes = revisionChanges(
      [rev("r1", "m", "x1", nobody), rev("r2", "m", "y1")],
      id => (id === "r1" ? [c("x1")] : [c("y1")]),
    );
    expect(revisionChangeTooltip(changes.r2)).toBe(
      `1 commit, none in common with the 1 in r1 by ${truncateDid(nobody.did)}`,
    );
  });

  test("single commits read in the singular and counts match the tooltip", () => {
    const one = revisionChanges(
      [rev("r1", "m", "a1"), rev("r2", "m", "a2")],
      id => (id === "r1" ? [c("a1")] : [c("a1"), c("a2")]),
    );
    expect(revisionChangeTooltip(one.r1)).toBe("First revision, 1 commit");
    expect(revisionChangeTooltip(one.r2)).toBe(
      "1 new since r1, 2 commits in total",
    );

    const empty = revisionChanges([rev("r1", "m", "m")], () => []);
    expect(revisionChangeTooltip(empty.r1)).toBe("First revision, 0 commits");
  });

  test("unloaded revisions at the end, or everywhere, get no entry", () => {
    const end = revisionChanges(patch.slice(0, 2), id =>
      id === "r2" ? undefined : patchCommits[id],
    );
    expect(Object.keys(end)).toEqual(["r1"]);
    expect(revisionChanges(patch, () => undefined)).toEqual({});
  });

  test("a mixed revision says whether its lines changed", () => {
    const revisions = [rev("r1", "m", "a3"), rev("r2", "m", "b1")];
    const commits = (id: string) =>
      id === "r1" ? [c("a1"), c("a2"), c("a3")] : [c("a1"), c("b1")];
    const differ = revisionChanges(revisions, commits, id => id);
    expect(differ.r2).toMatchObject({
      kind: "newAndGone",
      newCommits: 1,
      goneCommits: 2,
    });
    expect(revisionChangeTooltip(differ.r2)).toBe(
      "Changed lines differ from r1. 1 new, 2 gone, 2 commits in total",
    );

    const same = revisionChanges(revisions, commits, () => "p");
    expect(revisionChangeTooltip(same.r2)).toBe(
      "Same changed lines as r1. 1 of 2 commits has a new id, 2 gone",
    );
  });

  test("same lines under several new ids on a moved base", () => {
    const changes = revisionChanges(
      [rev("r1", "m1", "a3"), rev("r2", "m2", "b3")],
      id =>
        id === "r1" ? [c("a1"), c("a2"), c("a3")] : [c("a1"), c("b2"), c("b3")],
      () => "p",
    );
    expect(revisionChangeTooltip(changes.r2)).toBe(
      "Same changed lines as r1. 2 of 3 commits have new ids, 2 gone, base now m2",
    );
  });

  test("the lines lead with the previous author", () => {
    const changes = revisionChanges(
      [rev("r1", "m", "y1", bob), rev("r2", "m", "s")],
      id => (id === "r1" ? [c("y1")] : [c("s")]),
      id => id,
    );
    expect(revisionChangeTooltip(changes.r2)).toBe(
      "Changed lines differ from r1 by bob. 1 commit, none in common with the 1 in r1 by bob",
    );
  });

  test("gone and same never carry the lines", () => {
    const gone = revisionChanges(
      [rev("r1", "m", "a3"), rev("r2", "m", "a2")],
      id => (id === "r1" ? [c("a1"), c("a2"), c("a3")] : [c("a1"), c("a2")]),
      id => id,
    );
    expect(gone.r2).toHaveProperty("sameLines", false);
    expect(revisionChangeTooltip(gone.r2)).toBe(
      "1 gone since r1, 2 commits remain",
    );

    const same = revisionChanges(
      [rev("r1", "m", "a1"), rev("r2", "m", "a1")],
      () => [c("a1")],
      () => "p",
    );
    expect(revisionChangeTooltip(same.r2)).toBe("Same head as r1, 1 commit");
  });

  test("two empty revisions on different bases read as nothing gone", () => {
    const changes = revisionChanges(
      [rev("r1", "m1", "m1"), rev("r2", "m2", "m2")],
      () => [],
    );
    expect(changes.r2).toMatchObject({ kind: "onlyGone", goneCommits: 0 });
    expect(revisionChangeTooltip(changes.r2)).toBe(
      "0 gone since r1, 0 commits remain, base now m2",
    );
  });

  test("a rebase with the same lines names the new base", () => {
    const changes = revisionChanges(
      [rev("r1", "m1", "a3"), rev("r2", "m2", "b3")],
      id =>
        id === "r1" ? [c("a1"), c("a2"), c("a3")] : [c("b1"), c("b2"), c("b3")],
      () => "p",
    );
    expect(revisionChangeTooltip(changes.r2)).toBe(
      "Same changed lines as r1. 3 commits, none in common with the 3 in r1, new base m2",
    );
  });

  test("the base is shortened to seven characters", () => {
    const changes = revisionChanges(
      [rev("r1", "m", "a2"), rev("r2", "a1b2c3d4e5", "a3")],
      id => (id === "r1" ? [c("a1"), c("a2")] : [c("a2"), c("a3")]),
    );
    expect(revisionChangeTooltip(changes.r2)).toBe(
      "1 new, 1 gone since r1, 2 commits in total, base now a1b2c3d",
    );
  });
});
