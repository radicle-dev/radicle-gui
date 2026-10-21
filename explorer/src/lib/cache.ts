import { LRUCache } from "lru-cache";

export function cached<Args extends unknown[], V>(
  f: (...args: Args) => Promise<V>,
  makeKey: (...args: Args) => string,
  options?: LRUCache.Options<string, { promise: Promise<V> }, unknown>,
): (...args: Args) => Promise<V> {
  const cache = new LRUCache(options || { max: 500 });
  return function (...args: Args): Promise<V> {
    const key = makeKey(...args);
    const hit = cache.get(key);
    if (hit !== undefined) return hit.promise;

    const promise = f(...args);
    // Evict on rejection so the next caller can retry with a fresh request.
    promise.catch(() => {
      cache.delete(key);
    });
    cache.set(key, { promise });
    return promise;
  };
}
