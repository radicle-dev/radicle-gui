import type { BaseUrl } from "@http-client";
import type { ErrorRoute } from "@app/lib/router/definitions";

import config from "@app/lib/config";
import { ResponseParseError, ResponseError } from "@http-client/lib/fetcher";

export function handleError(
  error: Error | ResponseParseError | ResponseError,
  baseUrl: BaseUrl,
): ErrorRoute {
  if (error instanceof ResponseParseError) {
    const version = error.apiVersion ? ` (v${error.apiVersion})` : "";
    return {
      resource: "error",
      params: {
        error,
        title: "This node isn’t supported",
        description: `The node responded, but this explorer couldn’t read its response. It’s probably running a version of radicle-httpd${version} that this explorer doesn’t support (${config.nodes.requiredApiVersion}).`,
        baseUrl,
      },
    };
  } else if (error instanceof ResponseError) {
    return {
      resource: "error",
      params: {
        error,
        title: "Could not load this node",
        description: `The node responded with an error (${error.status}). It may be having temporary problems, or it may be misconfigured.`,
        baseUrl,
      },
    };
  } else if (
    error instanceof TypeError &&
    error.message === "Failed to fetch"
  ) {
    return {
      resource: "error",
      params: {
        title: "Could not reach this node",
        description:
          "The node may be offline, or the address may be wrong. If it’s your node, make sure radicle-httpd is running and its port is reachable.",
        baseUrl,
      },
    };
  } else {
    return {
      resource: "error",
      params: {
        error,
        title: "Could not load this node",
        description: "Something unexpected went wrong while loading this node.",
        baseUrl,
      },
    };
  }
}
