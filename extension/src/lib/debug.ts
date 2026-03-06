/** Debug logger that writes to chrome.storage.local so logs are visible
 *  from any DevTools context. Read logs by running in any console:
 *    chrome.storage.local.get("debug_log", r => console.log(r.debug_log))
 *  Clear logs:
 *    chrome.storage.local.remove("debug_log")
 */
const DEBUG = true
const MAX_LOG_LINES = 200

async function appendLog(level: string, tag: string, args: any[]) {
  const line = `[${new Date().toISOString().slice(11, 23)}] [${level}:${tag}] ${args.map(a => {
    try { return typeof a === "string" ? a : JSON.stringify(a) }
    catch { return String(a) }
  }).join(" ")}`

  console.log(line)

  try {
    const result = await chrome.storage.local.get("debug_log")
    const existing: string[] = result.debug_log || []
    existing.push(line)
    // Keep only last N lines
    const trimmed = existing.length > MAX_LOG_LINES ? existing.slice(-MAX_LOG_LINES) : existing
    await chrome.storage.local.set({ debug_log: trimmed })
  } catch {
    // storage might not be available in all contexts
  }
}

export function debug(tag: string, ...args: any[]) {
  if (!DEBUG) return
  appendLog("INFO", tag, args)
}

export function debugError(tag: string, ...args: any[]) {
  if (!DEBUG) return
  appendLog("ERROR", tag, args)
}

/** Read all stored logs. Call from any console:
 *  In extension context: debug_readLogs()
 *  Or: chrome.storage.local.get("debug_log", r => console.log(r.debug_log.join("\n")))
 */
export async function readLogs(): Promise<string[]> {
  const result = await chrome.storage.local.get("debug_log")
  return result.debug_log || []
}

export async function clearLogs(): Promise<void> {
  await chrome.storage.local.remove("debug_log")
}
