import { expect, test } from "./fixtures"

test("popup shell renders", async ({ page, extensionId }) => {
  await page.goto(`chrome-extension://${extensionId}/popup.html`)

  await expect(page.getByRole("heading", { name: "IWantJob" })).toBeVisible()
  await expect(page.getByRole("button", { name: "Open Side Panel" })).toBeVisible()
  await expect(page.getByRole("button", { name: "Settings" })).toBeVisible()
})

test("sidepanel shell renders", async ({ page, extensionId }) => {
  await page.goto(`chrome-extension://${extensionId}/sidepanel.html`)

  await expect(page.getByRole("button", { name: "Resume" })).toBeVisible()
  await expect(page.getByRole("button", { name: "Fill Form" })).toBeVisible()
  await expect(page.getByRole("button", { name: "Tracker" })).toBeVisible()
  await expect(page.getByText("No active application draft yet.")).toBeVisible()
})

test("options page renders tracker view", async ({ page, extensionId }) => {
  await page.goto(`chrome-extension://${extensionId}/options.html`)

  await expect(page.getByRole("heading", { name: "IWantJob" })).toBeVisible()
  await expect(page.getByRole("heading", { name: "Application Tracker" })).toBeVisible()
  await expect(page.getByRole("button", { name: "Settings" })).toBeVisible()
})
