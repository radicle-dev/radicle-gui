import type { BaseUrl, NodeIdentity, NodeStats } from "@http-client";
import type { ErrorRoute, NotFoundRoute } from "@app/lib/router/definitions";

import * as utils from "@app/lib/utils";
import { HttpdClient } from "@http-client";
import { ResponseError, ResponseParseError } from "@http-client/lib/fetcher";
import { handleError } from "@app/views/nodes/error";
import { nodePath } from "@app/views/nodes/router";
import { unreachableError } from "@app/views/repos/error";

export interface UserRoute {
  resource: "users";
  baseUrl: BaseUrl;
  did: string;
}

export interface UserLoadedRoute {
  resource: "users";
  params: {
    did: { prefix: string; pubkey: string };
    baseUrl: BaseUrl;
    node: NodeIdentity;
    nodeId: string;
    nodeAvatarUrl: string | undefined;
    stats: NodeStats;
  };
}

export async function loadUserRoute({
  did,
  baseUrl,
}: UserRoute): Promise<UserLoadedRoute | NotFoundRoute | ErrorRoute> {
  const parsedDid = utils.parseNodeId(decodeURIComponent(did));
  if (!parsedDid) {
    return {
      resource: "error",
      params: {
        title: "Invalid user DID provided",
        description:
          "The provided DID is invalid. Please review the identifier for any errors and try again.",
        error: new Error(`invalid user DID provided: ${did}`),
      },
    };
  }

  const api = new HttpdClient(baseUrl);
  try {
    const [stats, node, user] = await Promise.all([
      api.getStats(),
      api.getNode(),
      api.getNodeIdentity(parsedDid.pubkey),
    ]);

    return {
      resource: "users",
      params: {
        did: parsedDid,
        baseUrl,
        node: user,
        nodeId: node.id,
        nodeAvatarUrl: node.avatarUrl,
        stats,
      },
    };
  } catch (error) {
    console.error(error);
    if (
      error instanceof Error ||
      error instanceof ResponseError ||
      error instanceof ResponseParseError
    ) {
      return handleError(error, api.baseUrl);
    } else {
      return unreachableError();
    }
  }
}

export function userRouteToPath(route: UserRoute): string {
  return [nodePath(route.baseUrl), "users", route.did].join("/");
}

export function userTitle(route: UserLoadedRoute): string[] {
  if (route.params.node.alias) {
    return [route.params.node.alias, utils.formatDid(route.params.did)];
  }
  return [utils.formatDid(route.params.did)];
}
