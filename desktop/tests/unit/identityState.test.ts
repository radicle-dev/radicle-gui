import { expect, test } from "vitest";

import { stateCaption } from "@app/lib/identityState";

test("stateCaption names the sibling that was accepted", () => {
  expect(
    stateCaption({
      status: "rejected",
      reason: {
        type: "sibling",
        revision: "4b2d0a1e9f5c3b7a6d8e0f1a2b3c4d5e6f7a8b9c",
      },
    }),
  ).toBe("Rejected because sibling 4b2d0a1 was accepted");
  expect(stateCaption({ status: "accepted" })).toBeUndefined();
});
