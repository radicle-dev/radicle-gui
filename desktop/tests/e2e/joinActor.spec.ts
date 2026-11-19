import type { Page } from "@playwright/test";

import {
  aliceRemote,
  expect,
  gitOptions,
  test,
  useBackend,
} from "@tests/support/fixtures.js";

// A repository ID of the right shape that no peer holds.
const profileRid = "rad:z3gqcJUoA1n9HaHKufZs5FCSGazv5";

// The backend's answer about a profile that lives on another device.
function profileAnswer(overrides: object = {}) {
  return {
    rid: profileRid,
    kind: "person",
    keys: [
      {
        did: aliceRemote,
        alias: "laptop",
        bound: true,
        controller: true,
        addedAt: 0,
      },
    ],
    threshold: 1,
    majority: 1,
    payloadNewer: false,
    profile: { version: 1, displayName: "Alice Liddell" },
    profileNewer: false,
    profileUnreadable: false,
    pending: [],
    forks: [],
    ...overrides,
  };
}

async function openJoinForm(page: Page) {
  await page.addInitScript(() =>
    localStorage.setItem("labs.actorRepos", "true"),
  );
  await page.goto("/profile");
  await page.getByRole("button", { name: "Join existing profile" }).click();
}

test("the profile to join is shown before a code is made", async ({
  page,
  peer: _peer,
}) => {
  let lookups = 0;
  await page.route(/\/joinable_actor$/, route => {
    lookups += 1;
    return route.fulfill({ json: profileAnswer() });
  });
  let signed = 0;
  await page.route(/\/join_actor$/, route => {
    signed += 1;
    return route.fulfill({ json: "rad-enroll:made-for-the-test" });
  });
  await openJoinForm(page);

  await page.getByPlaceholder(/^Profile ID/).fill(profileRid);

  await expect(page.getByText("Is this your profile?")).toBeVisible();
  await expect(page.getByText("Alice Liddell")).toBeVisible();
  await expect(page.getByText("laptop", { exact: true })).toBeVisible();
  await expect(
    page.getByText(aliceRemote.slice("did:key:".length)),
  ).toBeVisible();
  expect(signed).toBe(0);

  await page.getByRole("button", { name: "Create code" }).click();

  await expect(page.getByText("rad-enroll:made-for-the-test")).toBeVisible();
  expect(signed).toBe(1);

  // Going back looks the profile up afresh: its keys may have changed.
  const before = lookups;
  // The header's history arrow is named "Back" too, and holds no text.
  await page.getByRole("button").filter({ hasText: "Back" }).click();

  await expect(page.getByText("Is this your profile?")).toBeVisible();
  await expect(page.getByPlaceholder(/^Profile ID/)).toHaveValue(profileRid);
  expect(lookups).toBe(before + 1);
});

test("an ID entered without its prefix is the same profile", async ({
  page,
  peer: _peer,
}) => {
  const asked: string[] = [];
  await page.route(/\/joinable_actor$/, route => {
    asked.push((route.request().postDataJSON() as { rid: string }).rid);
    return route.fulfill({ json: profileAnswer() });
  });
  await openJoinForm(page);

  await page
    .getByPlaceholder(/^Profile ID/)
    .fill(profileRid.replace(/^rad:/, ""));

  await expect(page.getByText("Is this your profile?")).toBeVisible();
  expect(asked).toEqual([profileRid]);
});

test("what this version cannot read of the profile is said", async ({
  page,
  peer: _peer,
}) => {
  await page.route(/\/joinable_actor$/, route =>
    route.fulfill({
      json: profileAnswer({
        payloadNewer: true,
        profile: undefined,
        profileUnreadable: true,
      }),
    }),
  );
  await openJoinForm(page);

  await page.getByPlaceholder(/^Profile ID/).fill(profileRid);

  await expect(
    page.getByText("It may hold keys this version does not show"),
  ).toBeVisible();
  await expect(
    page.getByText("Its profile file is not one this version of Desktop"),
  ).toBeVisible();
  await expect(page.getByText("A profile with no name")).toBeHidden();
});

test("a profile that is not on this device gets no code", async ({
  page,
  peer: _peer,
}) => {
  await openJoinForm(page);

  await page.getByPlaceholder(/^Profile ID/).fill(profileRid);

  await expect(
    page.getByText(/This profile is not on this device yet/),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Fetch the profile" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Create code" })).toBeHidden();
});

test("a profile fetched before anyone looked is still found", async ({
  page,
  peer: _peer,
}) => {
  // The fetch ends at once: from the moment it is asked for, the profile is
  // here, and it never shows up as being fetched.
  let arrived = false;
  await page.route(/\/joinable_actor$/, route =>
    arrived ? route.fulfill({ json: profileAnswer() }) : route.continue(),
  );
  await page.route(/\/seed$/, route => {
    arrived = true;
    return route.fulfill({ json: null });
  });
  await openJoinForm(page);

  await page.getByPlaceholder(/^Profile ID/).fill(profileRid);
  await page.getByRole("button", { name: "Fetch the profile" }).click();

  await expect(page.getByText("Is this your profile?")).toBeVisible();
});

test("a copy the node cannot update is fetched again", async ({
  page,
  peer: _peer,
}) => {
  // The copy arrives without a head while the profile is split: it stays
  // listed as being fetched, and no later fetch reaches it.
  let copy: "none" | "stuck" | "whole" = "none";
  const calls: string[] = [];
  await page.route(/\/seeded_not_replicated$/, route =>
    // Removing the copy leaves the policy, so it is awaited again at once.
    route.fulfill({
      json: calls.length > 0 && copy !== "whole" ? [profileRid] : [],
    }),
  );
  // One lookup during the wait fails for a reason of its own.
  let failures = 1;
  await page.route(/\/joinable_actor$/, route => {
    if (copy === "none") return route.continue();
    if (copy === "whole") return route.fulfill({ json: profileAnswer() });
    if (failures-- > 0) {
      return route.fulfill({
        status: 500,
        json: { code: "UnknownError", message: "The disk was busy." },
      });
    }

    return route.fulfill({
      status: 500,
      json: {
        code: "ActorError.CopyStuck",
        message: "This device cannot update that copy.",
      },
    });
  });
  await page.route(/\/seed$/, route => {
    calls.push("seed");
    // By the second fetch a controller has saved, and the split is closed.
    copy = calls.includes("clean") ? "whole" : "stuck";

    return route.fulfill({ json: null });
  });
  await page.route(/\/clean$/, route => {
    calls.push("clean");
    copy = "none";

    return route.fulfill({ json: null });
  });
  await openJoinForm(page);

  await page.getByPlaceholder(/^Profile ID/).fill(profileRid);
  await page.getByRole("button", { name: "Fetch the profile" }).click();

  await expect(
    page.getByText("This device cannot update that copy."),
  ).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByText("The disk was busy.")).toBeHidden();
  await expect(page.getByRole("button", { name: "Create code" })).toBeHidden();

  // Fetching again seeds without a dialog too.
  await page.getByRole("button", { name: "Fetch again" }).click();

  await expect(page.getByText("Is this your profile?")).toBeVisible();
  expect(calls).toEqual(["seed", "clean", "seed"]);
});

test("another repository being fetched does not set off lookups", async ({
  page,
  peer: _peer,
}) => {
  // The sidebar looks every few seconds while anything is on its way.
  await page.route(/\/seeded_not_replicated$/, route =>
    route.fulfill({ json: ["rad:z3fpY7nttPPa6MBnAv2DccHzQJnqe"] }),
  );
  let lookups = 0;
  await page.route(/\/joinable_actor$/, route => {
    lookups += 1;
    return route.continue();
  });
  await openJoinForm(page);

  await page.getByPlaceholder(/^Profile ID/).fill(profileRid);
  await expect(
    page.getByText(/This profile is not on this device yet/),
  ).toBeVisible();
  await page.waitForTimeout(11_000);

  expect(lookups).toBe(1);
});

test("text that is no profile ID says so", async ({ page, peer: _peer }) => {
  await openJoinForm(page);

  await page.getByPlaceholder(/^Profile ID/).fill("not an id");

  await expect(page.getByText(/That is not a Profile ID/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Create code" }),
  ).toBeDisabled();
});

test("a profile that cannot be fetched while the node is offline says so", async ({
  page,
  peerManager,
}) => {
  const peer = await peerManager.createPeer({
    name: "offline",
    gitOptions: gitOptions["bob"],
  });
  await peer.startHttpd();
  await useBackend(page, peer);
  await openJoinForm(page);

  await page.getByPlaceholder(/^Profile ID/).fill(profileRid);

  await expect(page.getByText(/Your node is offline/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Fetch the profile" }),
  ).toBeDisabled();
  await expect(page.getByRole("button", { name: "Create code" })).toBeHidden();
});
