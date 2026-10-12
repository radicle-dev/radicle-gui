import { writable } from "svelte/store";

export const nodeRunning = writable<boolean>(false);
// Undefined until the first probe, so nothing reports the node as down before
// it has been asked.
export const artifactNodeRunning = writable<boolean | undefined>(undefined);
