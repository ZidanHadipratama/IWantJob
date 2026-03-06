import { debug, debugError } from "./debug"

/**
 * Send a message to the content script on the active tab.
 * If the content script isn't loaded yet, inject it first and retry.
 */
export async function sendToContentScript(type: string): Promise<any> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  debug("messaging", "Active tab:", tab?.id, tab?.url)

  if (!tab?.id) throw new Error("No active tab found")

  const tabId = tab.id

  // Block chrome:// and edge:// pages
  if (tab.url?.startsWith("chrome://") || tab.url?.startsWith("edge://")) {
    throw new Error("Cannot run on browser internal pages. Navigate to a website first.")
  }

  // Try sending the message directly (content script may already be loaded)
  try {
    const response = await chrome.tabs.sendMessage(tabId, { type })
    debug("messaging", "Direct response:", response)
    if (response && typeof response === "object" && response.success !== undefined) {
      return response
    }
    debug("messaging", "Got non-useful response, will try injecting...")
  } catch (err: any) {
    debug("messaging", "No content script found:", err?.message || JSON.stringify(err) || "unknown error")
  }

  // Content script not loaded — find the correct filename from manifest and inject
  const manifest = chrome.runtime.getManifest()
  const csFile = manifest.content_scripts?.[0]?.js?.[0]
  debug("messaging", "Content script file from manifest:", csFile)

  if (!csFile) {
    throw new Error("No content script file found in manifest")
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: [csFile]
    })
    debug("messaging", "Content script injected successfully")
  } catch (err: any) {
    const msg = err?.message || JSON.stringify(err) || "unknown error"
    debugError("messaging", "Failed to inject content script:", msg)
    throw new Error(`Could not inject content script: ${msg}`)
  }

  // Wait for the script to initialize
  await new Promise(resolve => setTimeout(resolve, 500))

  // Retry the message
  try {
    const response = await chrome.tabs.sendMessage(tabId, { type })
    debug("messaging", "Response after injection:", response)
    if (response && typeof response === "object") {
      return response
    }
    throw new Error("Content script returned empty response after injection")
  } catch (err: any) {
    const msg = err?.message || JSON.stringify(err) || "unknown error"
    debugError("messaging", "sendMessage failed after injection:", msg)
    throw new Error(`Could not connect to the page: ${msg}. Try refreshing the page.`)
  }
}
