import { debug, debugError } from "./debug"

const FRAME_AWARE_MESSAGE_TYPES = new Set(["EXTRACT_FORM", "AUTOFILL_FORM"])

type FrameProbeResult = {
  url: string
  score: number
  totalControls: number
}

type SendOptions = {
  frameId?: number | null
}

function probeFormFrame(): FrameProbeResult {
  const skipInputTypes = new Set([
    "hidden",
    "submit",
    "button",
    "reset",
    "image"
  ])
  const controls = Array.from(
    document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
      "input, textarea, select"
    )
  )

  const usableControls = controls.filter((el) => {
    if (el instanceof HTMLInputElement && skipInputTypes.has(el.type)) return false
    if (el instanceof HTMLInputElement && el.type === "hidden") return false
    return Boolean(el.offsetParent || el.getClientRects().length)
  })

  return {
    url: window.location.href,
    totalControls: usableControls.length,
    score: usableControls.length
  }
}

async function getActiveTab(): Promise<chrome.tabs.Tab> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  debug("messaging", "Active tab:", tab?.id, tab?.url)

  if (!tab?.id) throw new Error("No active tab found")
  if (tab.url?.startsWith("chrome://") || tab.url?.startsWith("edge://")) {
    throw new Error("Cannot run on browser internal pages. Navigate to a website first.")
  }

  return tab
}

function getContentScriptFile(): string {
  const manifest = chrome.runtime.getManifest()
  const csFile = manifest.content_scripts?.[0]?.js?.[0]
  debug("messaging", "Content script file from manifest:", csFile)

  if (!csFile) {
    throw new Error("No content script file found in manifest")
  }

  return csFile
}

async function injectContentScript(tabId: number, allFrames: boolean) {
  await chrome.scripting.executeScript({
    target: allFrames ? { tabId, allFrames: true } : { tabId },
    files: [getContentScriptFile()]
  })
}

async function probeCandidateFrames(tabId: number): Promise<chrome.scripting.InjectionResult<FrameProbeResult>[]> {
  return chrome.scripting.executeScript({
    target: { tabId, allFrames: true },
    func: probeFormFrame
  })
}

async function resolveTargetFrameId(tabId: number, preferredFrameId?: number | null): Promise<number | undefined> {
  if (typeof preferredFrameId === "number") {
    return preferredFrameId
  }

  const probeResults = await probeCandidateFrames(tabId)
  const candidate = probeResults
    .filter((entry) => entry.result && entry.result.score > 0)
    .sort((left, right) => {
      const scoreDiff = (right.result?.score || 0) - (left.result?.score || 0)
      if (scoreDiff !== 0) return scoreDiff
      return (left.frameId || 0) - (right.frameId || 0)
    })[0]

  debug(
    "messaging",
    "Frame probe results:",
    probeResults.map((entry) => ({
      frameId: entry.frameId,
      score: entry.result?.score || 0,
      totalControls: entry.result?.totalControls || 0,
      url: entry.result?.url || ""
    }))
  )

  return candidate?.frameId
}

async function sendMessage(
  tabId: number,
  message: Record<string, unknown>,
  frameId?: number
): Promise<any> {
  if (typeof frameId === "number") {
    return chrome.tabs.sendMessage(tabId, message, { frameId })
  }

  return chrome.tabs.sendMessage(tabId, message)
}

/**
 * Send a message to the content script on the active tab.
 * Supports frame-aware routing for embedded application forms.
 */
export async function sendToContentScript(
  type: string,
  payload?: Record<string, unknown>,
  options?: SendOptions
): Promise<any> {
  const tab = await getActiveTab()
  const tabId = tab.id as number
  const message = payload ? { type, ...payload } : { type }
  const isFrameAware = FRAME_AWARE_MESSAGE_TYPES.has(type)

  let frameId = isFrameAware ? await resolveTargetFrameId(tabId, options?.frameId) : undefined

  try {
    const response = await sendMessage(tabId, message, frameId)
    debug("messaging", "Direct response:", response, "frameId:", frameId)
    if (response && typeof response === "object" && response.success !== undefined) {
      return isFrameAware ? { ...response, frame_id: frameId } : response
    }
    debug("messaging", "Got non-useful response, will try injecting...")
  } catch (err: any) {
    debug("messaging", "No content script found:", err?.message || JSON.stringify(err) || "unknown error")
  }

  try {
    await injectContentScript(tabId, isFrameAware)
    debug("messaging", "Content script injected successfully", isFrameAware ? "in all frames" : "in top frame")
  } catch (err: any) {
    const msg = err?.message || JSON.stringify(err) || "unknown error"
    debugError("messaging", "Failed to inject content script:", msg)
    throw new Error(`Could not inject content script: ${msg}`)
  }

  await new Promise((resolve) => setTimeout(resolve, 500))

  if (isFrameAware) {
    frameId = await resolveTargetFrameId(tabId, options?.frameId)
  }

  try {
    const response = await sendMessage(tabId, message, frameId)
    debug("messaging", "Response after injection:", response, "frameId:", frameId)
    if (response && typeof response === "object") {
      return isFrameAware ? { ...response, frame_id: frameId } : response
    }
    throw new Error("Content script returned empty response after injection")
  } catch (err: any) {
    const msg = err?.message || JSON.stringify(err) || "unknown error"
    debugError("messaging", "sendMessage failed after injection:", msg)
    throw new Error(`Could not connect to the page: ${msg}. Try refreshing the page.`)
  }
}
