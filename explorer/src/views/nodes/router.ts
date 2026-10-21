import type { BaseUrl, Node, NodeStats } from "@http-client";
import type { ErrorRoute, NotFoundRoute } from "@app/lib/router/definitions";

import config from "@app/lib/config";
import { HttpdClient } from "@http-client";
import { ResponseError, ResponseParseError } from "@http-client/lib/fetcher";
import { handleError } from "@app/views/nodes/error";
import { unreachableError } from "@app/views/repos/error";
import { determineSeed } from "./SeedSelector";

export type NodesRouteParams =
  | {
      baseUrl: BaseUrl;
      repoPageIndex: number;
    }
  | undefined;

export interface NodesRoute {
  resource: "nodes";
  params: NodesRouteParams;
}

export interface NodesLoadedRoute {
  resource: "nodes";
  params: {
    baseUrl: BaseUrl;
    stats: NodeStats;
    node: Node;
  };
}

export function nodePath(baseUrl: BaseUrl) {
  const port = baseUrl.port ?? config.nodes.defaultHttpdPort;

  if (port === config.nodes.defaultHttpdPort) {
    return `/nodes/${baseUrl.hostname}`;
  } else {
    return `/nodes/${baseUrl.hostname}:${port}`;
  }
}

export async function loadNodeRoute(
  params: NodesRouteParams,
): Promise<NodesLoadedRoute | NotFoundRoute | ErrorRoute> {
  let baseUrl: BaseUrl;

  if (params) {
    baseUrl = params.baseUrl;
  } else {
    baseUrl = determineSeed();
  }

  const api = new HttpdClient(baseUrl);

  try {
    const [node, stats] = await Promise.all([api.getNode(), api.getStats()]);

    return {
      resource: "nodes",
      params: {
        baseUrl,
        node,
        stats,
      },
    };
  } catch (error) {
    if (
      error instanceof Error ||
      error instanceof ResponseError ||
      error instanceof ResponseParseError
    ) {
      return handleError(error, baseUrl);
    } else {
      return unreachableError();
    }
  }
}
