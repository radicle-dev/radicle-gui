import type { Artifact } from "@bindings/cob/release/Artifact";

import { describe, expect, test } from "vitest";

import type { StagedArtifact } from "@app/lib/stageArtifacts";
import {
  duplicatePicks,
  effective,
  planDetail,
  planSummary,
  planTitle,
  registerPlan,
  stageArtifacts,
} from "@app/lib/stageArtifacts";

const me = "did:key:z6MkMe";
const them = "did:key:z6MkThem";
const delegate = "did:key:z6MkDelegate";

function picked(name: string, cid = "cid") {
  return {
    path: `/tmp/${name}`,
    name,
    digest: { cid, sizeBytes: 3, fileCount: 1, directory: false },
  };
}

function artifact(overrides: Partial<Artifact> = {}): Artifact {
  return {
    cid: "cid",
    name: "build.tar",
    directory: false,
    author: { did: me },
    locations: [],
    attestations: [],
    redactions: [],
    redacted: false,
    metadata: {},
    ...overrides,
  };
}

function stage(
  name: string,
  artifacts: Artifact[],
  { nodeRunning = true, seeded = new Set<string>() } = {},
) {
  const [item] = stageArtifacts([picked(name)], artifacts, {
    ownDid: me,
    delegates: new Set([delegate]),
    nodeRunning,
    seeded,
  });
  return item;
}

describe("stageArtifacts", () => {
  test("registers and seeds a new artifact", () => {
    const item = stage("build.tar", []);
    expect(item).toMatchObject({ register: true, seed: true });
    expect(item.existing).toBeUndefined();
  });

  test("registers a new artifact without seeding when the node is down", () => {
    expect(stage("build.tar", [], { nodeRunning: false })).toMatchObject({
      register: true,
      seed: false,
    });
  });

  test("registers a rename of your own artifact", () => {
    expect(stage("renamed.tar", [artifact()])).toMatchObject({
      register: true,
      existing: { name: "build.tar", keepsName: false },
    });
  });

  test("keeps the name of someone else's artifact and only seeds", () => {
    const item = stage("renamed.tar", [artifact({ author: { did: them } })]);
    expect(item).toMatchObject({
      register: false,
      seed: true,
      existing: { name: "build.tar", keepsName: true },
    });
  });

  test("skips an artifact your node already seeds", () => {
    expect(
      stage("build.tar", [artifact()], { seeded: new Set(["cid"]) }),
    ).toMatchObject({ register: false, seed: false });
  });

  test("skips an existing artifact when the node is down", () => {
    expect(
      stage("build.tar", [artifact()], { nodeRunning: false }),
    ).toMatchObject({ register: false, seed: false });
  });

  test("carries the redaction reason of a redacted artifact", () => {
    const item = stage("build.tar", [
      artifact({
        author: { did: them },
        redacted: true,
        redactions: [
          { user: { did: "did:key:z6MkOther" }, reason: "ignored" },
          { user: { did: delegate }, reason: "malware" },
        ],
      }),
    ]);
    expect(item.existing?.redaction).toBe("malware");
    expect(effective(item, false)).toEqual({ register: false, seed: false });
    expect(effective(item, true)).toEqual({ register: false, seed: true });
  });

  test("skips a later pick with the same contents", () => {
    const [first, second] = stageArtifacts(
      [picked("a.tar"), picked("b.tar")],
      [],
      {
        ownDid: me,
        delegates: new Set(),
        nodeRunning: true,
        seeded: new Set(),
      },
    );
    expect(first).toMatchObject({ register: true, seed: true });
    expect(first.duplicateOf).toBeUndefined();
    expect(second).toMatchObject({
      register: false,
      seed: false,
      duplicateOf: "a.tar",
    });
    expect(effective(second, true)).toEqual({ register: false, seed: false });
  });
});

describe("duplicatePicks", () => {
  test("maps later picks to the first with the same contents", () => {
    expect(
      duplicatePicks([
        picked("a.tar", "x"),
        picked("b.tar", "y"),
        picked("c.tar", "x"),
        picked("d.tar", "x"),
      ]),
    ).toEqual(
      new Map([
        ["/tmp/c.tar", "a.tar"],
        ["/tmp/d.tar", "a.tar"],
      ]),
    );
  });

  test("ignores picks still hashing", () => {
    expect(
      duplicatePicks([
        { path: "/tmp/a.tar", name: "a.tar" },
        { path: "/tmp/b.tar", name: "b.tar" },
      ]).size,
    ).toBe(0);
  });
});

function staged(overrides: Partial<StagedArtifact> = {}): StagedArtifact {
  return { ...picked("build.tar"), register: true, seed: false, ...overrides };
}

const renamed = staged({
  existing: { name: "old.tar", keepsName: false },
});
const kept = staged({
  register: false,
  existing: { name: "old.tar", keepsName: true },
});
const redacted = staged({
  register: false,
  existing: { name: "old.tar", keepsName: false, redaction: "bad" },
});
const reseeded = staged({
  register: false,
  seed: true,
  existing: { name: "build.tar", keepsName: false },
});
const duplicate = staged({ register: false, duplicateOf: "a.tar" });

describe("registerPlan", () => {
  test("counts what each pick does", () => {
    const plan = registerPlan(
      [staged(), renamed, reseeded, kept, duplicate],
      false,
    );
    expect(plan).toMatchObject({
      newCount: 1,
      renamedCount: 1,
      seededCount: 1,
      skippedCount: 2,
    });
    expect(plan.acting).toHaveLength(3);
  });

  test("skips a redacted match unless it is included", () => {
    expect(registerPlan([redacted], false).skippedCount).toBe(1);
    expect(
      registerPlan([{ ...redacted, register: true }], true).acting,
    ).toHaveLength(1);
  });

  test("is empty for no picks", () => {
    expect(registerPlan([], false)).toMatchObject({
      newCount: 0,
      skippedCount: 0,
      acting: [],
    });
  });
});

describe("planTitle", () => {
  test.each([
    [[kept], "Already registered"],
    [[staged()], "Register 1 artifact"],
    [[staged(), renamed], "Register 2 artifacts"],
    [[renamed], "Update 1 artifact"],
  ])("%#", (items, expected) => {
    expect(planTitle(registerPlan(items, false))).toBe(expected);
  });
});

describe("planSummary", () => {
  test("lists only the counts that are not zero", () => {
    expect(planSummary(registerPlan([staged(), kept, duplicate], false))).toBe(
      "1 registered, 2 skipped",
    );
  });

  test("is empty when nothing is staged", () => {
    expect(planSummary(registerPlan([], false))).toBe("");
  });
});

describe("planDetail", () => {
  function detail(item: StagedArtifact, includeRedacted = false) {
    const [planned] = registerPlan([item], includeRedacted).items;
    return planDetail(planned, includeRedacted);
  }

  test.each([
    ["a new file", staged(), "3 B"],
    [
      "a new folder",
      staged({
        digest: { cid: "c", sizeBytes: 3, fileCount: 2, directory: true },
      }),
      "2 files · 3 B",
    ],
    [
      "a folder with one file",
      staged({
        digest: { cid: "c", sizeBytes: 3, fileCount: 1, directory: true },
      }),
      "1 file · 3 B",
    ],
    ["a repeated pick", duplicate, "same as “a.tar” · skipped"],
    ["a redacted match", redacted, "redacted · skipped"],
    ["a rename", renamed, "renames “old.tar”"],
    ["someone else's name", kept, "stays “old.tar” · skipped"],
    [
      "an existing artifact to seed",
      reseeded,
      "already registered · will seed",
    ],
  ])("%s", (_, item, expected) => {
    expect(detail(item)).toBe(expected);
  });

  test("describes an included redacted match like any other", () => {
    expect(detail(redacted, true)).toBe("already registered · skipped");
  });
});
