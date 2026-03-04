// Type definitions for chrome.storage.local keys

export interface AIConfig {
  provider: string
  api_key: string
  model: string
}

export interface DBConfig {
  supabase_url: string
  supabase_key: string
}

export interface UserProfileConfig {
  name: string
  email: string
  linkedin_url: string
  github_url: string
  work_authorization: string
}

export interface StorageSchema {
  ai_config: AIConfig
  db_config: DBConfig
  backend_url: string
  user_profile: UserProfileConfig
  user_id: string
  base_resume_text: string
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
