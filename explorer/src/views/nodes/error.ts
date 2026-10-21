import type { BaseUrl } from "@http-client";
import type { ErrorRoute, NotFoundRoute } from "@app/lib/router/definitions";

import { ResponseParseError, ResponseError } from "@http-client/lib/fetcher";

export function handleError(
  error: Error | ResponseParseError | ResponseError,
  baseUrl: BaseUrl,
): NotFoundRoute | ErrorRoute {
  if (error instanceof ResponseParseError) {
    return {
      resource: "error",
      params: {
        error,
        title: "Could not parse the request",
        description: error.description,
        baseUrl,
      },
    };
  } else if (error instanceof ResponseError) {
    return {
      resource: "error",
      params: {
        error,
        title: "Could not load this node",
        description:
          "You’re trying to access a node that is not reachable. Make sure the address below is correct and the right ports are exposed if it’s your node.",
        baseUrl,
      },
    };
  } else if (
    error instanceof TypeError &&
    error.message === "Failed to fetch"
  ) {
    return {
      resource: "notFound",
      params: {
        title: "Could not connect to",
        description:
          "The node may be offline or the address may be incorrect.\nSelect a different node to continue.",
        baseUrl,
      },
    };
  } else {
    return {
      resource: "error",
      params: {
        error,
        title: "Could not load this node",
        description:
          "You stumbled on an unknown error, we aren’t exactly sure what happened.",
        baseUrl,
      },
    };
  }
}
