// Runs loads so that only the latest one's result is applied: one that finishes
// after a later one started is older than what that one will show.
export function latestOnly<T>(
  apply: (value: T) => void,
): (load: () => Promise<T>) => Promise<void> {
  let generation = 0;
  return async load => {
    const current = ++generation;
    const value = await load();
    if (current === generation) apply(value);
  };
}
