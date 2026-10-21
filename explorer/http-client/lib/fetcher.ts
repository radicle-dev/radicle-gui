// This module provides low-level capabilities to interact with a typed
// JSON HTTP API.

import type { ZodIssue, ZodType, TypeOf } from "zod";

import config from "@app/lib/config";
import { satisfies } from "compare-versions";

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
  public apiVersion: string | undefined;
  public zodIssues: ZodIssue[];
  public path?: string;

  public constructor(
    method: string,
    body: unknown,
    apiVersion: string,
    zodIssues: ZodIssue[],
    path?: string,
  ) {
    super("Failed to parse response body");
    const explorerRequiredApiVersion = config.nodes.requiredApiVersion;
    const nodeApiVersion = apiVersion;

    let description: string;
    if (!satisfies(nodeApiVersion, explorerRequiredApiVersion)) {
      description = `The node you are fetching from (v${nodeApiVersion}) doesn’t match the version requirements of <code>radicle-explorer</code> ${explorerRequiredApiVersion}.`;
    } else {
      description = `The node (v${nodeApiVersion}) matches the version requirement of <code>radicle-explorer</code> (${explorerRequiredApiVersion}), but <code>radicle-explorer</code> isn’t able to parse the response.`;
    }
    this.apiVersion = apiVersion;
    this.description =
      "The response received from the seed does not match the expected schema.<br/>".concat(
        description,
        config.deploymentId
          ? ""
          : "<br/>If you are self-hosting <code>radicle-explorer</code> and run into this error, try to clear the browser’s <code>localStorage</code> and the cache.",
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
      const response = await this.fetch({ method: "GET" });
      const info = await response.json();
      throw new ResponseParseError(
        params.method,
        responseBody,
        info.version,
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
