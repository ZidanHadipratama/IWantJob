import path from "node:path"
import { defineConfig } from "@playwright/test"

const demoRoot = path.resolve(__dirname, "..", "assets", "demo")

export default defineConfig({
  testDir: "./tests",
  globalSetup: "./tests/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  expect: {
    timeout: 5_000
  },
  retries: process.env.CI ? 2 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  outputDir: "test-results",
  use: {
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure"
  },
  webServer: {
    command: `/home/ikktaa/app/IWantJob/.venv/bin/python3 -m http.server 4173 --directory "${demoRoot}"`,
    url: "http://127.0.0.1:4173/index.html",
    reuseExistingServer: true,
    stdout: "ignore",
    stderr: "pipe"
  }
})
