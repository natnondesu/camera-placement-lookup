// Browser tests of the built console: `pnpm e2e` builds, serves public/ and runs them.
// Desktop Chrome for most flows; WebKit as an iPhone for the phone layout and the 3D view on Safari's engine.
import { defineConfig, devices } from "@playwright/test";

const PORT = 5190;
// WebGL in headless Chrome needs the software renderer.
const chromeArgs = ["--enable-unsafe-swiftshader"];

export default defineConfig({
  testDir: "e2e",
  testMatch: /.*\.spec\.mjs/,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  reporter: [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${PORT}/`,
    // The offline service worker would carry files between tests; each test starts clean.
    serviceWorkers: "block",
  },
  webServer: {
    command: `node e2e/serve.mjs ${PORT}`,
    url: `http://127.0.0.1:${PORT}/`,
    reuseExistingServer: false,
  },
  projects: [
    {
      name: "desktop",
      testIgnore: /phone\.spec/,
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1000 }, launchOptions: { args: chromeArgs } },
    },
    {
      name: "iphone",
      testMatch: /phone\.spec/,
      use: { ...devices["iPhone 13"] },
    },
  ],
});
