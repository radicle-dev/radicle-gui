import type { BaseUrl } from "@http-client";

import { HttpdClient } from "@http-client";
import { cached } from "@app/lib/cache";

// The release date of a node's radicle-httpd, fetched once per seed.
export const nodeReleasedAt = cached(
  async (baseUrl: BaseUrl) =>
    (await new HttpdClient(baseUrl).getNodeInfo()).releasedAt,
  baseUrl => `${baseUrl.scheme}://${baseUrl.hostname}:${baseUrl.port}`,
);
