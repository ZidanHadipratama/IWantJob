import { getStorage, getOrCreateUserId } from "./storage"

const DEFAULT_BACKEND_URL = "http://localhost:8000"

export interface ApiClient {
  testConnection(): Promise<{ connected: boolean; message: string }>
  uploadResume(file: File): Promise<{ resume_text: string; message: string }>
  saveResumeText(text: string): Promise<{ resume_text: string; message: string }>
}

/**
 * Creates an API client that reads config from storage and injects required headers.
 */
export async function createApiClient(): Promise<ApiClient> {
  const [backendUrlRaw, dbConfig, userId] = await Promise.all([
    getStorage("backend_url"),
    getStorage("db_config"),
    getOrCreateUserId()
  ])

  const backendUrl = backendUrlRaw || DEFAULT_BACKEND_URL
  const supabaseUrl = dbConfig?.supabase_url || ""
  const supabaseKey = dbConfig?.supabase_key || ""

  function baseHeaders(): Record<string, string> {
    return {
      "X-Supabase-Url": supabaseUrl,
      "X-Supabase-Key": supabaseKey,
      "X-User-Id": userId
    }
  }

  return {
    async testConnection() {
      try {
        const res = await fetch(`${backendUrl}/test-connection`, {
          method: "GET",
          headers: baseHeaders()
        })
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          return {
            connected: false,
            message: body?.detail || `Server returned ${res.status}`
          }
        }
        const data = await res.json()
        return {
          connected: true,
          message: data?.message || "Connected successfully"
        }
      } catch (err) {
        return {
          connected: false,
          message: err instanceof Error ? err.message : "Network error — is the backend running?"
        }
      }
    },

    async uploadResume(file: File) {
      try {
        const formData = new FormData()
        formData.append("file", file)

        const res = await fetch(`${backendUrl}/upload-resume`, {
          method: "POST",
          headers: baseHeaders(),
          body: formData
        })
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body?.detail || `Server returned ${res.status}`)
        }
        return await res.json()
      } catch (err) {
        return {
          resume_text: "",
          message: err instanceof Error ? err.message : "Failed to upload resume"
        }
      }
    },

    async saveResumeText(text: string) {
      try {
        const res = await fetch(`${backendUrl}/save-resume-text`, {
          method: "POST",
          headers: {
            ...baseHeaders(),
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ resume_text: text })
        })
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body?.detail || `Server returned ${res.status}`)
        }
        return await res.json()
      } catch (err) {
        return {
          resume_text: text,
          message: err instanceof Error ? err.message : "Failed to save resume text"
        }
      }
    }
  }
}
