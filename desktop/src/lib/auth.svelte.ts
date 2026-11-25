import type { ErrorWrapper } from "@bindings/error/ErrorWrapper";

import { get } from "svelte/store";

import { deepLinksReady } from "@app/lib/deepLink";
import { dynamicInterval } from "@app/lib/interval";
import { invoke } from "@app/lib/invoke";
import * as router from "@app/lib/router";

export const startup = $state<{ error?: ErrorWrapper }>({ error: undefined });

let lock = false;

export async function checkAuth() {
  try {
    if (lock) {
      return;
    }
    lock = true;
    await invoke("authenticate", { passphrase: "" });
    dynamicInterval(
      "auth",
      checkAuth,
      import.meta.env.VITE_AUTH_LONG_DELAY || 30_000,
    );
    // Only leave the booting screen after a failed authentication. On a
    // normal start the route is still booting while the first page loads.
    if (
      startup.error !== undefined &&
      get(router.activeRouteStore).resource === "booting"
    ) {
      void router.push({ resource: "inbox" }).finally(deepLinksReady);
    } else {
      deepLinksReady();
    }
  } catch (err) {
    const error = err as ErrorWrapper;
    startup.error = error;
    if (get(router.activeRouteStore).resource !== "booting") {
      void router.push({ resource: "booting" });
    }
    dynamicInterval("auth", checkAuth, 5_000);
  } finally {
    lock = false;
  }
}
