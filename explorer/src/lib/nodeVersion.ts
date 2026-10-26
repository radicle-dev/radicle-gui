import type { BaseUrl } from "@http-client";

import { HttpdClient } from "@http-client";
import { cached } from "@app/lib/cache";

// The radicle-httpd version of a node, fetched once per seed.
export const nodeVersion = cached(
  async (baseUrl: BaseUrl) =>
    (await new HttpdClient(baseUrl).getNodeInfo()).version,
  baseUrl => `${baseUrl.scheme}://${baseUrl.hostname}:${baseUrl.port}`,
);
