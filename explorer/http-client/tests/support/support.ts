import type { HttpdClient } from "@http-client";

import { expect } from "vitest";
import isMatch from "lodash/isMatch";

import { cobRid } from "@tests/support/fixtures";

export async function assertIssue(
  oid: string,
  change: Record<string, unknown>,
  api: HttpdClient,
) {
  expect(
    //@prettier-ignore looks more readable than what prettier suggests.
    isMatch(await api.repo.getIssueById(cobRid, oid), change),
  ).toBe(true);
}

export async function assertPatch(
  oid: string,
  change: Record<string, unknown>,
  api: HttpdClient,
) {
  expect(
    //@prettier-ignore looks more readable than what prettier suggests.
    isMatch(await api.repo.getPatchById(cobRid, oid), change),
  ).toBe(true);
}
