import type { RepoInfo } from "@bindings/repo/RepoInfo";

import { get } from "svelte/store";

import { invoke } from "@app/lib/invoke";
import { show } from "@app/lib/modal";
import * as router from "@app/lib/router";

import ConfirmVisibility from "@app/modals/ConfirmVisibility.svelte";

export function changeVisibility(repo: RepoInfo) {
  const toPrivate = repo.visibility.type === "public";
  show({
    component: ConfirmVisibility,
    props: {
      name: repo.payloads["xyz.radicle.project"]?.data.name ?? repo.rid,
      private: toPrivate,
      majority: Math.floor(repo.delegates.length / 2) + 1,
      async confirm() {
        await invoke("update_visibility", {
          rid: repo.rid,
          private: toPrivate,
          opts: { announce: true },
        });
        await router.replace(get(router.activeUnloadedRouteStore));
      },
    },
  });
}
