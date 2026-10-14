// Runs edits one at a time in submission order and refreshes once the queue
// drains, so quick successive toggles neither race nor refresh per edit.
export function serialEdits(
  errorMessage: string,
  refresh: () => Promise<void>,
): (run: () => Promise<unknown>) => void {
  let queue: Promise<void> = Promise.resolve();
  let pending = 0;

  return run => {
    pending += 1;
    queue = queue.then(async () => {
      try {
        await run();
      } catch (error) {
        console.error(errorMessage, error);
      } finally {
        pending -= 1;
        if (pending === 0) await refresh();
      }
    });
  };
}
