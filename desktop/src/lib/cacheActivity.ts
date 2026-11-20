// When the cache last heard of a change from the node or the user's own write.
// A change to the node's COB cache soon after is most likely the same one.
let lastHeard = 0;

export function heardOfChange(): void {
  lastHeard = Date.now();
}

export function heardOfChangeWithin(ms: number): boolean {
  return Date.now() - lastHeard < ms;
}
