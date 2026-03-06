// Type definitions for chrome.storage.local keys

export interface AIModelConfig {
  provider: string // "openai" | "anthropic" | "google" | "deepseek" | "ollama"
  api_key: string
  model: string
}

export interface AIConfig {
  default: AIModelConfig
  overrides?: {
    tailor?: AIModelConfig
    fill?: AIModelConfig
  }
}

export interface DBConfig {
  supabase_url: string
  supabase_key: string
}

export interface StorageSchema {
  ai_config: AIConfig
  db_config: DBConfig
  backend_url: string
  user_id: string
  base_resume_text: string
  base_resume_json: object | null
  debug_log: string[]
  // Session state — persists across tab switches
  resume_session: {
    phase: string
    jdText: string
    company: string
    jobTitle: string
    jobUrl: string
    tailoredJson: object | null
    matchScore: number
  } | null
  fillform_session: {
    phase: string
    fields: object[]
    answers: object[]
    fieldCount: number
  } | null
}

/**
 * Typed getter for chrome.storage.local
 */
export async function getStorage<K extends keyof StorageSchema>(
  key: K
): Promise<StorageSchema[K] | null> {
  return new Promise((resolve) => {
    chrome.storage.local.get([key], (result) => {
      if (chrome.runtime.lastError) {
        console.error("getStorage error:", chrome.runtime.lastError)
        resolve(null)
        return
      }
      const value = result[key]
      resolve(value !== undefined ? (value as StorageSchema[K]) : null)
    })
  })
}

/**
 * Typed setter for chrome.storage.local
 */
export async function setStorage<K extends keyof StorageSchema>(
  key: K,
  value: StorageSchema[K]
): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set({ [key]: value }, () => {
      if (chrome.runtime.lastError) {
        console.error("setStorage error:", chrome.runtime.lastError)
        reject(chrome.runtime.lastError)
        return
      }
      resolve()
    })
  })
}

/**
 * Gets user_id from storage, or generates a new UUID and stores it.
 */
export async function getOrCreateUserId(): Promise<string> {
  const existing = await getStorage("user_id")
  if (existing) return existing

  const newId = crypto.randomUUID()
  await setStorage("user_id", newId)
  return newId
}

/**
 * Migrate old flat AIConfig to new per-feature structure.
 * Old shape: { provider, api_key, model }
 * New shape: { default: { provider, api_key, model }, overrides?: {...} }
 */
export function migrateAIConfig(raw: any): AIConfig {
  if (raw && raw.default && raw.default.provider) {
    return raw as AIConfig
  }
  if (raw && raw.provider) {
    return {
      default: {
        provider: raw.provider,
        api_key: raw.api_key || "",
        model: raw.model || ""
      }
    }
  }
  return {
    default: { provider: "openai", api_key: "", model: "gpt-4o" }
  }
}
