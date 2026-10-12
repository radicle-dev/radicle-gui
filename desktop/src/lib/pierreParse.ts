import type { FileDiffMetadata } from "@pierre/diffs";

import { processPatch } from "@pierre/diffs";

import type { ParseRequest, ParseResponse } from "@app/lib/pierreParse.worker";
import PierreParseWorker from "@app/lib/pierreParse.worker?worker";

// Parse a unified patch into per-file (partial) diffs off the main thread so
// large diffs do not stutter. Falls back to synchronous main-thread parsing if
// the worker cannot be created.

let parseWorker: Worker | undefined | null;
let parseSeq = 0;
const pending = new Map<
  number,
  {
    resolve: (response: ParseResponse) => void;
    reject: (error: unknown) => void;
  }
>();

function getParseWorker(): Worker | undefined {
  if (parseWorker !== undefined) {
    return parseWorker ?? undefined;
  }
  try {
    const worker = new PierreParseWorker();
    worker.onmessage = (event: MessageEvent<ParseResponse>) => {
      const data = event.data;
      const entry = pending.get(data.id);
      if (!entry) {
        return;
      }
      pending.delete(data.id);
      if ("error" in data) {
        entry.reject(new Error(data.error));
      } else {
        entry.resolve(data);
      }
    };
    // If the worker dies, in-flight requests would otherwise hang forever.
    // Reject them and drop the worker (`null` = permanent fallback) so this and
    // future parses run on the main thread instead.
    worker.onerror = event => {
      const error = new Error(event.message || "parse worker crashed");
      for (const entry of pending.values()) {
        entry.reject(error);
      }
      pending.clear();
      parseWorker = null;
    };
    parseWorker = worker;
  } catch (error) {
    console.error(
      "PierreDiff: parse worker unavailable; parsing on the main thread",
      error,
    );
    parseWorker = null;
  }
  return parseWorker ?? undefined;
}

function send(
  worker: Worker,
  patch: string,
  cacheKeyPrefix: string | undefined,
): Promise<ParseResponse> {
  const id = ++parseSeq;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    worker.postMessage({ id, patch, cacheKeyPrefix } satisfies ParseRequest);
  });
}

// Parse a unified patch into per-file (partial) diffs.
//
// `cacheKeyPrefix` must be unique per diff (e.g. the commit or revision id): it
// becomes each file's `cacheKey` (`<prefix>-<index>`), which the worker pool
// uses to cache highlight results. Without it Pierre keys the cache by file
// path alone, so the same path across two commits collides and the shared pool
// serves a stale, differently-sized highlight — the walk then overruns it and
// the file renders blank.
export async function parsePatch(
  patch: string,
  cacheKeyPrefix?: string,
): Promise<FileDiffMetadata[]> {
  const worker = getParseWorker();
  if (!worker) {
    return processPatch(patch, cacheKeyPrefix).files;
  }
  try {
    const response = await send(worker, patch, cacheKeyPrefix);
    return "files" in response ? response.files : [];
  } catch (error) {
    // Worker crash or a parse error inside it — fall back to the main thread so
    // the diff still renders (a genuinely unparseable patch throws again here).
    console.error(
      "PierreDiff: parse worker failed; parsing on the main thread",
      error,
    );
    return processPatch(patch, cacheKeyPrefix).files;
  }
}
