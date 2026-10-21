import type { PlaywrightTestConfig } from "@playwright/test";

import base from "./playwright.config.js";

const config: PlaywrightTestConfig = {
  ...base,
  testDir: "./tests/build",
  use: {
    ...base.use,
    baseURL: "http://localhost:4173",
  },
  retries: 0,
  globalSetup: undefined,
  webServer: {
    command: "npm run serve",
    port: 4173,
  },
};

export default config;
