import type { RepoRoute } from "@app/views/repo/router";
import type { Config } from "@bindings/config/Config";

import { cachedConfig, cachedRepoById } from "@app/lib/invoke";
import { referenceRoute } from "@app/lib/mentions";
import { show } from "@app/lib/modal";
import type { RadReference, RadUri } from "@app/lib/radUri";
import { parseRadUri } from "@app/lib/radUri";
import * as router from "@app/lib/router";
import { explorerHost, explorerLink } from "@app/lib/utils";

import NotOnThisNode from "@app/modals/NotOnThisNode.svelte";
import UnopenableLink from "@app/modals/UnopenableLink.svelte";

export type DeepLinkTarget =
  | { type: "route"; route: RepoRoute }
  | { type: "external"; url: string }
  | { type: "missing"; rid: string; url?: string };

export function parseDeepLink(
  link: string,
): { type: "uri"; uri: RadUri } | undefined {
  // A RID copied as `rad:z…` is easily pasted after `rad:///`.
  const uri = parseRadUri(
    link.trim().replace(/^rad:(?:\/\/\/?)?rad:/i, "rad:"),
  );

  return uri && { type: "uri", uri };
}

export function deepLinkTarget(
  reference: RadReference,
  local: boolean,
  config: Config,
): DeepLinkTarget | undefined {
  const url = explorerLink(reference, config);
  if (!local && reference.type === "uri") {
    return { type: "missing", rid: `rad:${reference.uri.repo}`, url };
  }

  const route = referenceRoute(reference);
  if (route) return { type: "route", route };

  return url ? { type: "external", url } : undefined;
}

// Links can arrive before the app has authenticated and routed, so they wait
// until it has, and are opened one at a time.
export function createLinkQueue(open: (link: string) => Promise<void>) {
  const pending: string[] = [];
  let ready = false;
  let flushing = false;

  async function flush() {
    if (!ready || flushing) return;
    flushing = true;
    try {
      for (let link = pending.shift(); link; link = pending.shift()) {
        await open(link).catch(console.error);
      }
    } finally {
      flushing = false;
    }
  }

  return {
    receive(links: string[]) {
      pending.push(...links);
      void flush();
    },
    ready() {
      ready = true;
      void flush();
    },
  };
}

// An untrusted link only ever navigates; seeding a repo or leaving the app
// for the browser needs the user's confirmation.
async function openDeepLink(link: string) {
  const reference = parseDeepLink(link);
  if (!reference) {
    show({ component: UnopenableLink, props: { link, reason: "invalid" } });
    return;
  }

  const [config, local] = await Promise.all([
    cachedConfig(),
    cachedRepoById(`rad:${reference.uri.repo}`).then(
      repo => repo !== null,
      () => false,
    ),
  ]);
  const target = deepLinkTarget(reference, local, config);
  if (target?.type === "route") {
    await router.push(target.route);
  } else if (target) {
    show({
      component: NotOnThisNode,
      props: {
        url: target.url,
        host: explorerHost(config),
        rid: target.type === "missing" ? target.rid : undefined,
      },
    });
  } else {
    show({ component: UnopenableLink, props: { link, reason: "no-page" } });
  }
}

const queue = createLinkQueue(openDeepLink);
const launchKey = "deepLink:launch";

export function deepLinksReady() {
  queue.ready();
}

export async function listenForDeepLinks() {
  if (!window.__TAURI_INTERNALS__) return;

  const { getCurrent, onOpenUrl } =
    await import("@tauri-apps/plugin-deep-link");
  await onOpenUrl(links => queue.receive(links));

  // A reload of the webview reports the same launch link again.
  const launched = (await getCurrent()) ?? [];
  const seen = readLaunch();
  if (launched.length > 0 && JSON.stringify(launched) !== seen) {
    writeLaunch(JSON.stringify(launched));
    queue.receive(launched);
  }
}

function readLaunch(): string | null {
  try {
    return sessionStorage.getItem(launchKey);
  } catch {
    return null;
  }
}

function writeLaunch(value: string) {
  try {
    sessionStorage.setItem(launchKey, value);
  } catch {
    return;
  }
}
