import type { UnlistenFn } from "@tauri-apps/api/event";

import { listen } from "@tauri-apps/api/event";
import once from "lodash/once";

import { invoke } from "@app/lib/invoke";

import { artifactNodeRunning, nodeRunning } from "./events";

export let unlistenNodeEvents: UnlistenFn | undefined = undefined;

export function setUnlistenNodeEvents(unlisten: UnlistenFn) {
  unlistenNodeEvents = unlisten;
}

// Will be called once in the startup of the app
export const createEventEmittersOnce = once(async (): Promise<UnlistenFn> => {
  if (!window.__TAURI_INTERNALS__) {
    // The test backend can't emit events, so poll at the backend's pace.
    const pollNodes = () => {
      invoke<boolean>("node_running")
        .then(running => nodeRunning.set(running))
        .catch(console.error);
      invoke<boolean>("artifact_node_running")
        .then(running => artifactNodeRunning.set(running))
        .catch(console.error);
    };
    pollNodes();
    const interval = setInterval(pollNodes, 2_000);
    return () => clearInterval(interval);
  }

  const unlisteners = await Promise.all([
    listen<boolean>("node_running", event => {
      nodeRunning.set(event.payload);
    }),
    listen<boolean>("artifact_node_running", event => {
      artifactNodeRunning.set(event.payload);
    }),
  ]);
  return () => unlisteners.forEach(unlisten => unlisten());
});
