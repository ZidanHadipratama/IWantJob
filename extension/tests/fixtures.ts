import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import { chromium, expect, test as base } from "@playwright/test"
import type { BrowserContext, Page } from "@playwright/test"

const extensionName = "IWantJob"
const extensionPath = path.resolve(__dirname, "..", "build", "chrome-mv3-prod")

async function resolveExtensionId(page: Page) {
  await page.goto("chrome://extensions/")

  await expect
    .poll(async () => {
      return page.evaluate((name) => {
        const manager = document.querySelector("extensions-manager") as any
        const items = manager?.shadowRoot
          ?.querySelector("extensions-item-list")
          ?.shadowRoot?.querySelectorAll("extensions-item")

        for (const item of items ?? []) {
          const itemName = item.shadowRoot?.querySelector("#name")?.textContent?.trim()
          if (itemName === name) {
            return item.getAttribute("id")
          }
        }

        return null
      }, extensionName)
    })
    .toBeTruthy()

  const extensionId = await page.evaluate((name) => {
    const manager = document.querySelector("extensions-manager") as any
    const items = manager?.shadowRoot
      ?.querySelector("extensions-item-list")
      ?.shadowRoot?.querySelectorAll("extensions-item")

    for (const item of items ?? []) {
      const itemName = item.shadowRoot?.querySelector("#name")?.textContent?.trim()
      if (itemName === name) {
        return item.getAttribute("id")
      }
    }

    return null
  }, extensionName)

  if (!extensionId) {
    throw new Error(`Could not resolve extension id for ${extensionName}`)
  }

  return extensionId
}

type ExtensionFixtures = {
  context: BrowserContext
  extensionId: string
  page: Page
}

export const test = base.extend<ExtensionFixtures>({
  context: async ({}, use) => {
    const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), "iwj-playwright-"))
    const context = await chromium.launchPersistentContext(userDataDir, {
      channel: "chromium",
      headless: process.env.PLAYWRIGHT_EXTENSION_HEADLESS !== "0",
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`
      ]
    })

    try {
      await use(context)
    } finally {
      await context.close()
      await fs.rm(userDataDir, { recursive: true, force: true })
    }
  },

  extensionId: async ({ context }, use) => {
    const page = await context.newPage()
    const extensionId = await resolveExtensionId(page)
    await page.close()
    await use(extensionId)
  },

  page: async ({ context }, use) => {
    const page = await context.newPage()
    await use(page)
    await page.close()
  }
})

export { expect }
