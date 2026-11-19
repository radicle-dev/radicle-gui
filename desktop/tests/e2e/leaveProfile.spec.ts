import type { Page } from "@playwright/test";

import { aliceRemote, expect, test } from "@tests/support/fixtures.js";

// Two repository IDs of the right shape that no peer holds.
const joinedRid = "rad:z3gqcJUoA1n9HaHKufZs5FCSGazv5";
const createdRid = "rad:z4V1sjrXqjvFdnCUbxPFqd5p4DtH5";

const key = (did: string, controller = true) => ({
  did,
  bound: true,
  controller,
  addedAt: 0,
});

const profile = (
  rid: string,
  displayName: string,
  keys: ReturnType<typeof key>[],
) => ({
  rid,
  kind: "person",
  keys,
  threshold: 1,
  majority: Math.floor(keys.filter(k => k.controller).length / 2) + 1,
  payloadNewer: false,
  profile: { version: 1, displayName },
  profileNewer: false,
  profileUnreadable: false,
  pending: [] as object[],
  forks: [],
});

// The backend's answers about a key that two profiles bind, which takes a
// second device to bring about: one the device joined and shares, and one it
// created and alone controls. Once `created` is retired, the device is in
// `joined` only.
async function twoProfiles(page: Page, local: string) {
  const joined = profile(joinedRid, "Alice Liddell", [
    key(aliceRemote),
    key(local),
  ]);
  const created = profile(createdRid, "Bob Belcher", [
    key(local),
    key(aliceRemote, false),
  ]);
  const state = { joined, created, retired: false };

  await page.addInitScript(() =>
    localStorage.setItem("labs.actorRepos", "true"),
  );
  await page.route(/\/actor$/, route =>
    state.retired
      ? route.fulfill({ json: joined })
      : route.fulfill({
          status: 500,
          json: {
            code: "ActorError.Ambiguous",
            message: "This key belongs to more than one profile.",
          },
        }),
  );
  await page.route(/\/actors_of_key$/, route =>
    route.fulfill({ json: state.retired ? [joined] : [joined, created] }),
  );

  return state;
}

// By its ID, since one row can name the other profile.
const rowOf = (page: Page, rid: string) =>
  page.locator(".profile", { hasText: rid });

test("a device in two profiles leaves one and waits for the approval", async ({
  page,
  peer,
}) => {
  const local = `did:key:${peer.nodeId}`;
  const { joined } = await twoProfiles(page, local);
  let left: unknown;

  await page.route(/\/leave_actor$/, route => {
    left = route.request().postDataJSON();
    joined.pending = [
      {
        id: "0000000000000000000000000000000000000001",
        author: local,
        createdAt: 0,
        added: [],
        removed: [local],
        accepted: [local],
        rejected: [] as string[],
        unreadable: false,
      },
    ];

    return route.fulfill({ json: joined });
  });
  await page.route(/\/cancel_leave$/, route => {
    joined.pending = [];

    return route.fulfill({ json: joined });
  });

  await page.goto("/profile?tab=keys");

  await expect(page.getByText("This device is in two profiles")).toBeVisible();
  const row = (rid: string) => rowOf(page, rid);
  const leave = row(joinedRid).getByRole("button", {
    name: "Leave",
    exact: true,
  });
  // Nothing but a retirement ends a profile this device alone controls.
  await expect(row(createdRid)).toContainText("can only be retired");
  await expect(
    row(createdRid).getByRole("button", { name: "Leave", exact: true }),
  ).toHaveCount(0);

  await leave.click();
  await expect(row(joinedRid)).toContainText(
    "This device stays in Bob Belcher",
  );
  await row(joinedRid).getByRole("button", { name: "Yes" }).click();

  await expect(row(joinedRid)).toContainText("You asked to leave.");
  await expect(row(joinedRid)).toContainText("1 of 2 approved.");
  await expect(leave).toHaveCount(0);
  await expect(row(createdRid)).toContainText(
    "You are already leaving Alice Liddell",
  );
  expect(left).toMatchObject({ rid: joinedRid });
  // The leave was asked for on the Keys tab, and the page stays on it.
  await expect(page.locator(".tab.active")).toContainText("Keys");

  // The wait is read from the profile, so another device's vote shows when
  // the page loads again.
  (joined.pending[0] as { rejected: string[] }).rejected = [aliceRemote];
  await page.reload();
  await expect(row(joinedRid)).toContainText("1 of 2 approved, 1 rejected.");

  // The other device may never answer, so the leave can be taken back.
  await row(joinedRid).getByRole("button", { name: "Cancel leave" }).click();
  await expect(leave).toBeVisible();
  await expect(row(joinedRid)).not.toContainText("You asked to leave.");
});

test("a device retires the profile it alone controls and is left in the other", async ({
  page,
  peer,
}) => {
  const state = await twoProfiles(page, `did:key:${peer.nodeId}`);
  let retired: unknown;

  let refuse = true;
  await page.route(/\/retire_actor$/, route => {
    if (refuse) {
      return route.fulfill({
        status: 500,
        json: { code: "UnknownError", message: "Your keys changed just now." },
      });
    }
    retired = route.request().postDataJSON();
    state.retired = true;

    return route.fulfill({ json: state.created });
  });

  await page.goto("/profile");
  await rowOf(page, createdRid).getByRole("button", { name: "Retire" }).click();

  // Nothing is signed until the dialog is confirmed, and it says what ends.
  const dialog = page.locator(".modal");
  await expect(dialog).toContainText("Bob Belcher");
  await expect(dialog).toContainText(createdRid);
  await expect(dialog).toContainText("This device stays in Alice Liddell.");
  await expect(dialog).toContainText(
    "This profile has 1 other device. It loses the profile too",
  );
  await expect(dialog).toContainText("This cannot be undone.");
  expect(retired).toBeUndefined();

  // A refused retirement is said in the dialog, which stays for another try.
  await dialog.getByRole("button", { name: "Retire" }).click();
  await expect(dialog).toContainText("Your keys changed just now.");
  await expect(page.getByText("This device is in two profiles")).toBeVisible();

  refuse = false;
  await dialog.getByRole("button", { name: "Retire" }).click();

  await expect(page.getByText("This device is in two profiles")).toBeHidden();
  await expect(page.getByText("Profile ID")).toBeVisible();
  await expect(page.getByText(joinedRid)).toBeVisible();
  expect(retired).toMatchObject({ rid: createdRid });
});
