// This module provides low-level capabilities to interact with a typed
// JSON HTTP API.

import type { ZodIssue, ZodType, TypeOf } from "zod";

import config from "@app/lib/config";
import { isOutdated, releaseDate, releasedAtSchema } from "./compat.js";

export interface BaseUrl {
  hostname: string;
  port: number;
  scheme: string;
}

// Error that is thrown by `Fetcher` methods.
export class ResponseError extends Error {
  public method: string;
  public url: string;
  public status: number;
  public body: unknown;

  public constructor(method: string, response: Response, body_: unknown) {
    const body: unknown = body_;
    if (
      typeof body === "object" &&
      body !== null &&
      "message" in body &&
      typeof body.message === "string"
    ) {
      super(body.message);
    } else {
      super("Response error");
    }

    this.method = method;
    this.body = body_;
    this.status = response.status;
    this.url = response.url;
  }
}

// Error that is thrown by `Fetcher` methods when parsing the response
// body fails.
export class ResponseParseError extends Error {
  public method: string;
  public body: unknown;
  public description: string;
  public nodeVersion: string | undefined;
  public releasedAt: number | undefined;
  public zodIssues: ZodIssue[];
  public path?: string;

  public constructor(
    method: string,
    body: unknown,
    nodeVersion: string | undefined,
    releasedAt: number | undefined,
    zodIssues: ZodIssue[],
    path?: string,
  ) {
    super("Failed to parse response body");
    const node = nodeVersion ? `The node (v${nodeVersion})` : "The node";
    this.nodeVersion = nodeVersion;
    this.releasedAt = releasedAt;
    const outdated =
      releasedAt !== undefined && isOutdated(releasedAt)
        ? ` It runs a radicle-httpd release from ${releaseDate(releasedAt)}, which explorer no longer supports. Its operator should upgrade it.`
        : "";
    this.description =
      `${node} sent a response that radicle-explorer can’t parse.${outdated}`.concat(
        config.deploymentId
          ? ""
          : " If you are self-hosting radicle-explorer, try to clear the browser’s localStorage and the cache.",
      );

    this.method = method;
    this.path = path;
    this.body = body;
    this.zodIssues = zodIssues;
  }
}

export interface RequestOptions {
  abort?: AbortSignal;
}

export interface FetchParams {
  method: Method;
  // Path to append to the `Fetcher`s base URL to get the final URL.
  path?: string;
  // Object that is serialized into JSON and sent as the data.
  body?: unknown;
  // Query parameters to be serialized with URLSearchParams.
  query?: Record<string, string | number | boolean>;
  options?: RequestOptions;
  headers?: Record<string, string>;
}

type Method = "DELETE" | "GET" | "PATCH" | "POST" | "PUT";

export class Fetcher {
  #baseUrl: BaseUrl;

  public constructor(baseUrl: BaseUrl) {
    this.#baseUrl = baseUrl;
  }

  // Execute a fetch and parse the result with the provided schema.
  // Return the parsed payload.
  //
  // Throws `ResponseError` if the response status code is not `200`.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public async fetchOk<T extends ZodType<any>>(
    params: FetchParams,
    schema: T,
  ): Promise<TypeOf<T>> {
    if (config.deploymentId) {
      params.query ||= {};
      params.query["deployment_id"] = config.deploymentId;
    }

    const response = await this.fetch(params);

    if (!response.ok) {
      let responseBody = await response.text();
      try {
        responseBody = JSON.parse(responseBody);
      } catch {
        // We keep the original text response body.
      }
      throw new ResponseError(params.method, response, responseBody);
    }

    const responseBody = await response.json();
    const result = schema.safeParse(responseBody);
    if (result.success) {
      return result.data;
    } else {
      const info = await this.fetch({ method: "GET" })
        .then(response => response.json())
        .catch(() => undefined);
      throw new ResponseParseError(
        params.method,
        responseBody,
        typeof info?.version === "string" ? info.version : undefined,
        info
          ? releasedAtSchema.catch(undefined).parse(info.releasedAt)
          : undefined,
        result.error.issues,
        params.path,
      );
    }
  }

  private async fetch({
    method,
    path,
    body,
    options = {},
    query,
    headers = {},
  }: FetchParams): Promise<Response> {
    if (body !== undefined && headers["content-type"] === undefined) {
      headers["content-type"] = "application/json";
    }

    const pathSegment = path === undefined ? "" : `/${path}`;

    // Compat: older httpd serves the API only at `/api/v1`, newer httpd
    // serves it at both `/api` and `/api/v1`. Client: switch to `/api` after 2027-03-14.
    let url = `${this.#baseUrl.scheme}://${this.#baseUrl.hostname}:${this.#baseUrl.port}/api/v1${pathSegment}`;

    if (query) {
      const searchparams = new URLSearchParams(query as Record<string, string>);
      url = `${url}?${searchparams.toString()}`;
    }
    return globalThis.fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: options.abort,
    });
  }
}
