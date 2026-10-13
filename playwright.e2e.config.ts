// End-to-end tests against the real stack. Reuses `npm run dev` if it is
// already running, otherwise starts it.
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  reporter: "list",
  timeout: 30_000,
  use: { baseURL: "http://127.0.0.1:3000" },
  webServer: {
    command: "npm run dev",
    url: "http://127.0.0.1:3000/health",
    reuseExistingServer: true,
    timeout: 90_000,
  },
});
