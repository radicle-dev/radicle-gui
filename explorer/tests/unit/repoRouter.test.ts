import { describe, expect, test } from "vitest";
import {
  repoRouteToPath,
  resolveRepoRoute,
  testExports,
} from "@app/views/repos/router";

// Defining the window.origin value, since vitest doesn't provide one.
window.origin = "http://localhost:3000";

describe("isOid", () => {
  test.each([
    { oid: "a64ae9c6d572e0ad906faa9a4a7a8d43f113278c", expected: true },
    { oid: "a64ae9c", expected: false },
  ])("isOid $oid => $expected", ({ oid, expected }) => {
    expect(testExports.isOid(oid)).toEqual(expected);
  });
});

describe("repo alias in routes", () => {
  const node = { hostname: "localhost", port: 8080, scheme: "http" };
  const rid = "rad:z3gqcJUoA1n9HaHKufZs5FCSGazv5";

  test.each([
    { segment: "heartwood", description: "an alias" },
    { segment: rid, description: "a RID" },
  ])(
    "preserves $description as the repo segment through the router",
    ({ segment }) => {
      // The segment (alias or RID) is parsed in as `route.repo` verbatim …
      const route = resolveRepoRoute(node, segment, ["issues"], "");
      expect(route).not.toBeNull();
      expect(route?.repo).toEqual(segment);

      // … and rendered back into the path unchanged, so in-repo links keep
      // whichever form the user navigated in with.
      expect(repoRouteToPath(route!)).toContain(`/${segment}/issues`);
    },
  );
});
