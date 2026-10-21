import { describe, test } from "vitest";

import { HttpdClient } from "@http-client";
import config from "@app/lib/config";

const api = new HttpdClient({
  hostname: "127.0.0.1",
  port: config.nodes.defaultHttpdPort,
  scheme: "http",
});

describe("client", () => {
  test("#getNodeInfo()", async () => {
    await api.getNodeInfo();
  });

  test("#getStats()", async () => {
    await api.getStats();
  });

  test("#getNode()", async () => {
    await api.getNode();
  });
});
