import {
  getStorage,
  getOrCreateUserId,
  migrateAIConfig,
  type AIConfig,
  type AIModelConfig
} from "./storage"

const DEFAULT_BACKEND_URL = "http://localhost:8000"

export interface ApiClient {
  testConnection(): Promise<{ connected: boolean; message: string }>
  saveResumeText(text: string): Promise<{ resume_text: string; message: string }>
  parseResume(
    text: string
  ): Promise<{ resume_json: object; message: string }>
  saveResumeJson(json: object): Promise<{ resume_json: object; message: string }>
  tailorResume(req: {
    job_description: string
    resume_text?: string
    resume_json?: object
    job_id?: string
  }): Promise<{ tailored_resume_json: object; match_score: number; job_id?: string }>
  generatePdf(resumeJson: object): Promise<Blob>
  fillForm(req: {
    form_fields: object[]
    resume_text?: string
    resume_json?: object
    job_id?: string
    job_description?: string
  }): Promise<{ answers: object[]; job_id?: string; qa_saved: boolean }>
  logJob(req: {
    company: string
    title: string
    url?: string
    job_description?: string
    status?: string
    job_id?: string
  }): Promise<{ id: string; company: string; title: string; status: string; created_at: string }>
}

/**
 * Resolve the correct AIModelConfig for a feature (override if set, else default).
 */
function resolveModel(
  config: AIConfig,
  feature: "tailor" | "fill"
): AIModelConfig {
  const override = config.overrides?.[feature]
  if (override && override.provider && override.model) {
    return override
  }
  return config.default
}

/**
 * Build AI headers from an AIModelConfig.
 */
function aiHeaders(model: AIModelConfig): Record<string, string> {
  const headers: Record<string, string> = {
    "X-AI-Provider": model.provider,
    "X-AI-Model": model.model
  }
  if (model.api_key) {
    headers["X-AI-Key"] = model.api_key
  }
  return headers
}

/**
 * Creates an API client that reads config from storage and injects required headers.
 */
export async function createApiClient(): Promise<ApiClient> {
  const [backendUrlRaw, dbConfig, userId, aiConfigRaw] = await Promise.all([
    getStorage("backend_url"),
    getStorage("db_config"),
    getOrCreateUserId(),
    getStorage("ai_config")
  ])

  const backendUrl = backendUrlRaw || DEFAULT_BACKEND_URL
  const supabaseUrl = dbConfig?.supabase_url || ""
  const supabaseKey = dbConfig?.supabase_key || ""
  const aiConfig = migrateAIConfig(aiConfigRaw)

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
          message:
            err instanceof Error
              ? err.message
              : "Network error — is the backend running?"
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
          message:
            err instanceof Error ? err.message : "Failed to save resume text"
        }
      }
    },

    async parseResume(text: string) {
      const model = resolveModel(aiConfig, "tailor")
      const res = await fetch(`${backendUrl}/parse-resume`, {
        method: "POST",
        headers: {
          ...baseHeaders(),
          ...aiHeaders(model),
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ resume_text: text })
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.detail || `Server returned ${res.status}`)
      }
      return await res.json()
    },

    async saveResumeJson(json: object) {
      const res = await fetch(`${backendUrl}/save-resume-json`, {
        method: "POST",
        headers: {
          ...baseHeaders(),
          "Content-Type": "application/json"
        },
        body: JSON.stringify(json)
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.detail || `Server returned ${res.status}`)
      }
      return await res.json()
    },

    async tailorResume(req) {
      const model = resolveModel(aiConfig, "tailor")
      const res = await fetch(`${backendUrl}/tailor-resume`, {
        method: "POST",
        headers: {
          ...baseHeaders(),
          ...aiHeaders(model),
          "Content-Type": "application/json"
        },
        body: JSON.stringify(req)
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.detail || `Server returned ${res.status}`)
      }
      return await res.json()
    },

    async fillForm(req) {
      const model = resolveModel(aiConfig, "fill")
      const res = await fetch(`${backendUrl}/fill-form`, {
        method: "POST",
        headers: {
          ...baseHeaders(),
          ...aiHeaders(model),
          "Content-Type": "application/json"
        },
        body: JSON.stringify(req)
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.detail || `Server returned ${res.status}`)
      }
      return await res.json()
    },

    async generatePdf(resumeJson: object) {
      const res = await fetch(`${backendUrl}/generate-pdf`, {
        method: "POST",
        headers: {
          ...baseHeaders(),
          "Content-Type": "application/json"
        },
        body: JSON.stringify(resumeJson)
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.detail || `Server returned ${res.status}`)
      }
      return await res.blob()
    },

    async logJob(req) {
      const res = await fetch(`${backendUrl}/log-job`, {
        method: "POST",
        headers: {
          ...baseHeaders(),
          "Content-Type": "application/json"
        },
        body: JSON.stringify(req)
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.detail || `Server returned ${res.status}`)
      }
      return await res.json()
    }
  }
}
