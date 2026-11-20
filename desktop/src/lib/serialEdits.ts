// Runs edits one at a time in submission order, so quick successive toggles
// don't race. Each write refreshes what it changed by itself.
export function serialEdits(
  errorMessage: string,
): (run: () => Promise<unknown>) => void {
  let queue: Promise<void> = Promise.resolve();

  return run => {
    queue = queue.then(async () => {
      try {
        await run();
      } catch (error) {
        console.error(errorMessage, error);
      }
    });
  };
}
