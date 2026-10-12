import { describe, expect, test } from "vitest";

import { seedTarget } from "@app/lib/seedRepo";

const rid = "rad:z3fpY7nttPPa6MBnAv2DccHzQJnqe";
const bare = "z3fpY7nttPPa6MBnAv2DccHzQJnqe";

describe("seedTarget", () => {
  test.each([rid, bare, `  ${rid}  `])("accepts %j as %j", input => {
    expect(seedTarget(input, [], [])).toEqual({ rid });
  });

  test.each(["", "rad:", "rad:z0OIl", "not a rid", "rad:zabc"])(
    "rejects %j",
    input => {
      expect(seedTarget(input, [], [])).toEqual({ error: "RID is not valid" });
    },
  );

  test.each([rid, bare])("reports %j as already queued", input => {
    expect(seedTarget(input, [rid], [])).toEqual({
      error: "This repo is already queued for fetching",
    });
  });

  test.each([rid, bare])("reports %j as already seeded", input => {
    expect(seedTarget(input, [], [rid])).toEqual({
      error: "This repo is already seeded",
    });
  });
});
