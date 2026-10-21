import {
  defaultConfig,
  expect,
  shortNodeRemote,
  sourceBrowsingRid,
  test,
} from "@tests/support/fixtures.js";

test("node metadata", async ({ page, peerManager }) => {
  const peer = await peerManager.createPeer({
    name: "node-metadata-peer",
  });
  await peer.startNode({
    node: {
      ...defaultConfig.node,
      seedingPolicy: { default: "allow", scope: "all" },
      alias: "palm",
      externalAddresses: ["seed.radicle.test:8123"],
    },
  });
  await peer.startHttpd();

  await page.goto(peer.uiUrl());

  await expect(page.getByText(shortNodeRemote).first()).toBeVisible();
  await expect(page.getByText(/\/radicle:\d\//)).toBeVisible();
});

test("node repos", async ({ page }) => {
  await page.goto("/nodes/localhost");
  const repo = page
    .locator(".repo-card", { hasText: "source-browsing" })
    .nth(0);

  // Repo metadata.
  {
    await expect(repo.getByText("source-browsing")).toBeVisible();
    await expect(
      repo.getByText("Git repository for source browsing tests"),
    ).toBeVisible();
  }
});

test("show pinned repositories", async ({ page }) => {
  await page.goto("/");
  // Shows pinned repo name.
  await expect(page.getByText("source-browsing")).toBeVisible();
  //
  // Shows pinned repo description.
  await expect(
    page.getByText("Git repository for source browsing tests"),
  ).toBeVisible();
});

test("unreachable node shows error with seed selector", async ({ page }) => {
  await page.goto("/nodes/this.node.does.not.exist.xyz", {
    waitUntil: "networkidle",
  });

  // Shows the error title with the unreachable hostname.
  await expect(page.getByText("Could not connect to")).toBeVisible();
  await expect(page.getByText("this.node.does.not.exist.xyz")).toBeVisible();

  // Shows the description.
  await expect(
    page.getByText("The node may be offline or the address may be incorrect."),
  ).toBeVisible();
  await expect(
    page.getByText("Select a different node to continue."),
  ).toBeVisible();

  // Shows the seed selector toggle.
  await expect(
    page.getByRole("button", { name: "Seed selector" }),
  ).toBeVisible();
});

test("seed selector on not-found page allows navigating to a working node", async ({
  page,
}) => {
  await page.goto("/nodes/this.node.does.not.exist.xyz", {
    waitUntil: "networkidle",
  });

  await expect(page.getByText("Could not connect to")).toBeVisible();

  // Open the seed selector and navigate to the working local node.
  await page.getByRole("button", { name: "Seed selector" }).click();
  await page.getByRole("button", { name: "Add new" }).click();
  await page.getByPlaceholder("seed.radicle.example").fill("localhost:8081");
  await page.getByPlaceholder("seed.radicle.example").press("Enter");

  // Should navigate to the working node.
  await expect(page).toHaveURL("/nodes/localhost");
  await expect(page.getByText("source-browsing")).toBeVisible();
});

test("unreachable seed on repo page shows error with seed selector", async ({
  page,
}) => {
  await page.goto(`/nodes/this.node.does.not.exist.xyz/${sourceBrowsingRid}`, {
    waitUntil: "networkidle",
  });

  await expect(page.getByText("Could not connect to")).toBeVisible();
  await expect(page.getByText("this.node.does.not.exist.xyz")).toBeVisible();

  // Seed selector is available to navigate away.
  await expect(
    page.getByRole("button", { name: "Seed selector" }),
  ).toBeVisible();
});

test("edit seed bookmarks", async ({ page }) => {
  // Proxy requests to seed.example.tld to the local test api.
  await page.route(
    url => url.hostname === "seed.example.tld",
    route =>
      route.fulfill({
        status: 301,
        headers: {
          Location: route
            .request()
            .url()
            .replace("seed.example.tld", "localhost"),
        },
      }),
  );

  await page.goto("/");

  // The seed picker lives in the Settings dropdown now.
  const openSettings = () =>
    page.getByRole("button", { name: "Settings" }).click();
  await openSettings();

  const seedSelector = page.getByRole("button", {
    name: "Search seed selector",
  });

  // Add a custom seed via the seed selector.
  await seedSelector.click();
  await page.getByRole("button", { name: "Add new" }).click();
  await page.getByPlaceholder("seed.radicle.example").fill("seed.example.tld");
  await page.getByPlaceholder("seed.radicle.example").press("Enter");

  // On the explore page the URL is unchanged, but the active seed switches to
  // the new custom seed, which is added to the bookmarked custom seeds.
  await expect(seedSelector).toContainText("seed.example.tld");

  await seedSelector.click();
  await expect(
    page.getByRole("button", { name: "Remove bookmark", exact: true }),
  ).toBeVisible();

  // The bookmark persists across reloads.
  await page.reload();
  await openSettings();
  await seedSelector.click();
  await expect(
    page.getByRole("button", { name: "Remove bookmark", exact: true }),
  ).toBeVisible();

  // Removing the bookmark drops it from the custom seeds.
  await page
    .getByRole("button", { name: "Remove bookmark", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Remove bookmark", exact: true }),
  ).not.toBeVisible();
});

test("node can be switched from a repo the node doesn't have", async ({
  page,
}) => {
  // A syntactically valid RID that localhost doesn't seed, so httpd answers
  // 404 rather than failing to connect.
  await page.goto("/nodes/localhost/rad:z4BwwjPCFNVP27FwVbDFgwVwkjciZ", {
    waitUntil: "networkidle",
  });

  await expect(page.getByText("Repository not found")).toBeVisible();

  // The URL still names a node, so the page must offer a way off it.
  await expect(
    page.getByRole("button", { name: "Seed selector" }),
  ).toBeVisible();
});

test("repo page shows the node selector in the header", async ({ page }) => {
  await page.goto(`/nodes/localhost/${sourceBrowsingRid}`, {
    waitUntil: "networkidle",
  });

  await expect(
    page.getByRole("button", { name: "Current node selector" }),
  ).toContainText("localhost");
});

test("breadcrumb picker lists a seed that isn't bookmarked", async ({
  page,
}) => {
  // Proxy requests to seed.example.tld to the local test api, so the page can
  // be served by a seed that is neither bookmarked nor a preferred one.
  await page.route(
    url => url.hostname === "seed.example.tld",
    route =>
      route.fulfill({
        status: 301,
        headers: {
          Location: route
            .request()
            .url()
            .replace("seed.example.tld", "localhost"),
        },
      }),
  );

  await page.goto(`/nodes/seed.example.tld/${sourceBrowsingRid}`, {
    waitUntil: "networkidle",
  });

  const picker = page.getByRole("button", { name: "Current node selector" });
  await expect(picker).toContainText("seed.example.tld");
  await picker.click();

  // The seed serving the page is listed under the custom seeds, even though
  // it was never bookmarked, and its node view is reachable from there.
  const item = page
    .locator(".item")
    .filter({ hasText: "seed.example.tld" })
    .first();
  await expect(item).toBeVisible();
  await item.getByRole("button", { name: "Open node view" }).click();

  await expect(page).toHaveURL("/nodes/seed.example.tld");
});
