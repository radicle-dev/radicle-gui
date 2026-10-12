export function debounced<T>(
  get: () => T,
  ms: number,
): { readonly current: T } {
  let current = $state(get());
  $effect(() => {
    const value = get();
    const timer = setTimeout(() => {
      current = value;
    }, ms);
    return () => clearTimeout(timer);
  });
  return {
    get current() {
      return current;
    },
  };
}
