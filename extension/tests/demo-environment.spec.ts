import { expect, test } from "./fixtures"

const demoBaseUrl = "http://127.0.0.1:4173"

test("controlled demo job page is reachable and readable", async ({ page }) => {
  await page.goto(`${demoBaseUrl}/job-posting.html`)

  await expect(page.getByRole("heading", { name: "Full Stack Product Engineer" })).toBeVisible()
  await expect(page.getByText("Northstar Labs", { exact: true })).toBeVisible()
  await expect(page.getByRole("link", { name: "Apply now" })).toBeVisible()
  await expect(page.getByRole("heading", { name: "What you will do" })).toBeVisible()
})

test("controlled demo application form exposes stable field types", async ({ page }) => {
  await page.goto(`${demoBaseUrl}/application-form.html`)

  await expect(page.getByRole("heading", { name: "Apply for Full Stack Product Engineer" })).toBeVisible()
  await expect(page.locator("#firstname")).toBeVisible()
  await expect(page.locator("#experience_level")).toBeVisible()
  await expect(page.getByRole("combobox", { name: "Educational attainment" })).toBeVisible()
  await expect(page.locator('input[type="file"]#resume_file')).toBeVisible()
  await expect(page.getByText("Do you have hands-on experience with React and TypeScript?")).toBeVisible()
})

test("controlled iframe demo exposes embedded form", async ({ page }) => {
  await page.goto(`${demoBaseUrl}/iframe-host.html`)

  await page.getByRole("button", { name: "Apply now" }).click()

  const frame = page.frameLocator('iframe[title="Embedded application form"]')
  await expect(frame.getByRole("heading", { name: "Embedded application form" })).toBeVisible()
  await expect(frame.locator("#iframe_firstname")).toBeVisible()
  await expect(frame.getByText("Do you have experience with RAG systems?")).toBeVisible()
})
