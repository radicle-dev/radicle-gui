const dynamicIntervals = new Map<string, ReturnType<typeof setTimeout>>();

export function dynamicInterval(
  key: string,
  callback: () => void,
  period: number,
) {
  // Clear an existing interval for this key, if any.
  if (dynamicIntervals.has(key)) {
    clearTimeout(dynamicIntervals.get(key));
  }

  // Set up a new dynamic interval.
  const id = setTimeout(() => {
    callback();
    dynamicInterval(key, callback, period);
  }, period);

  dynamicIntervals.set(key, id);
}

export function resetDynamicInterval(key: string) {
  clearTimeout(dynamicIntervals.get(key));
  dynamicIntervals.delete(key);
}

// Unlike setInterval, a slow run never overlaps the next one.
export function poll(
  task: (active: () => boolean) => Promise<void>,
  period: number,
): () => void {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const active = () => !stopped;

  const run = async () => {
    await task(active);
    if (!stopped) {
      timer = setTimeout(() => void run(), period);
    }
  };
  void run();

  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}
