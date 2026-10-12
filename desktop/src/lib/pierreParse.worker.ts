import type { FileDiffMetadata } from "@pierre/diffs";

import { processPatch } from "@pierre/diffs";

// Parsing a unified patch into per-file `FileDiffMetadata` (partial — only the
// patch's own context) is CPU-heavy and touches no DOM, so it runs here off the
// main thread. Results are plain data and post back via structured clone.
// (Full-file hydration for context expansion is handled by Pierre itself via
// the `loadDiffFiles` option, so it does not go through this worker.)

export type ParseRequest = {
  id: number;
  patch: string;
  cacheKeyPrefix?: string;
};

export type ParseResponse =
  { id: number; files: FileDiffMetadata[] } | { id: number; error: string };

// `self` is typed against the DOM lib here, so narrow to the worker surface we
// actually use to avoid the `Window.postMessage` signature.
const ctx = self as unknown as {
  onmessage: ((event: MessageEvent<ParseRequest>) => void) | null;
  postMessage: (message: ParseResponse) => void;
};

ctx.onmessage = (event: MessageEvent<ParseRequest>) => {
  const request = event.data;
  try {
    ctx.postMessage({
      id: request.id,
      files: processPatch(request.patch, request.cacheKeyPrefix).files,
    });
  } catch (error) {
    ctx.postMessage({ id: request.id, error: String(error) });
  }
};
