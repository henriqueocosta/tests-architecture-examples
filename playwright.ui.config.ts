// UI component tests: the real front-end, with the API mocked by page.route.
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/ui",
  reporter: "list",
  use: { baseURL: "http://127.0.0.1:4173" },
  webServer: {
    command: "tsx tests/ui/staticServer.ts",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: true,
  },
});
