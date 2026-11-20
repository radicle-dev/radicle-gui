import { writable } from "svelte/store";

export const nodeRunning = writable<boolean>(false);
// Whether the backend is subscribed to the node's events, so that the cache
// can rely on them. Without them, views poll or refetch on navigation.
export const nodeEvents = writable<boolean>(false);
// Undefined until the first probe, so nothing reports the node as down before
// it has been asked.
export const artifactNodeRunning = writable<boolean | undefined>(undefined);
