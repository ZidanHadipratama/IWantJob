import {
  getStorage,
  getOrCreateUserId,
  migrateAIConfig,
  type AIConfig,
  type AIModelConfig
} from "./storage"

const DEFAULT_BACKEND_URL = "http://localhost:8000"

export interface QAPairItem {
  field_id: string
  question: string
  answer: string
  field_type: string
  edited_by_user: boolean
  created_at?: string
  updated_at?: string
}

export interface ResumeRecord {
  id?: string
  job_id?: string | null
  resume_text?: string
  resume_json?: object | null
  pdf_url?: string | null
  is_base: boolean
  created_at: string
}

export interface JobListItem {
  id: string
  company: string
  title: string
  url?: string
  status: string
  job_type?: string
  employment_type?: string
  location?: string
  salary_range?: string
  applied_at?: string
  created_at: string
}

export interface JobDetail {
  id: string
  company: string
  title: string
  url?: string
  job_description?: string
  status: string
  job_type?: string
  employment_type?: string
  location?: string
  salary_range?: string
  applied_at?: string
  notes?: string
  created_at: string
  qa_pairs: QAPairItem[]
  resumes: ResumeRecord[]
  chat_messages: Array<Record<string, unknown>>
}

export interface JobMutation {
  job_id: string
  company: string
  title: string
  url?: string
  job_description?: string
  status?: string
  job_type?: string
  employment_type?: string
  location?: string
  salary_range?: string
  notes?: string
}

export interface JobMutationResult {
  id: string
  company: string
  title: string
  status: string
  job_type?: string
  employment_type?: string
  location?: string
  salary_range?: string
  notes?: string
  created_at: string
}

export interface TailorJobInfo {
  company?: string
  title?: string
  job_type?: string
  employment_type?: string
  location?: string
  salary_range?: string
}

export interface DraftSaveResult {
  job: JobMutationResult
  qa_pairs: QAPairItem[]
  resume_saved: boolean
}

export interface ServiceCheckResult {
  connected: boolean
  message: string
}

export interface ApiClient {
  testBackendHealth(): Promise<ServiceCheckResult>
  testConnection(): Promise<ServiceCheckResult>
  testAI(modelOverride?: AIModelConfig): Promise<ServiceCheckResult>
  saveResumeText(text: string): Promise<{ resume_text: string; message: string }>
  parseResume(
    text: string
  ): Promise<{ resume_json: object; message: string }>
  saveResumeJson(json: object): Promise<{ resume_json: object; message: string }>
  tailorResume(req: {
    job_description: string
    resume_text?: string
    resume_json?: object
    company?: string
    title?: string
    url?: string
    page_title?: string
    page_excerpt?: string
    metadata_lines?: string[]
    persist_job?: boolean
    job_id?: string
  }): Promise<{
    tailored_resume_json: object
    job_info: TailorJobInfo
    match_score: number
    job_id?: string
  }>
  generatePdf(resumeJson: object): Promise<Blob>
  fillForm(req: {
    form_fields: object[]
    resume_text?: string
    resume_json?: object
    persona_text?: string
    job_id?: string
    job_description?: string
  }): Promise<{ answers: object[]; job_id?: string; qa_saved: boolean }>
  saveApplicationDraft(req: {
    job_id?: string
    company: string
    title: string
    url?: string
    job_description?: string
    status?: string
    job_type?: string
    employment_type?: string
    location?: string
    salary_range?: string
    notes?: string
    tailored_resume_json: object
    qa_pairs?: QAPairItem[]
  }): Promise<DraftSaveResult>
  logJob(req: {
    company: string
    title: string
    url?: string
    job_description?: string
    status?: string
    job_id?: string
    job_type?: string
    employment_type?: string
    location?: string
    salary_range?: string
    notes?: string
  }): Promise<JobMutationResult>
  getJob(jobId: string): Promise<JobDetail>
  saveQA(jobId: string, qaPairs: QAPairItem[]): Promise<{ saved: number; qa_pairs: QAPairItem[] }>
  updateJob(req: JobMutation): Promise<JobMutationResult>
  getJobs(): Promise<JobListItem[]>
  deleteJob(jobId: string): Promise<void>
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
    async testBackendHealth() {
      try {
        const res = await fetch(`${backendUrl}/health`, {
          method: "GET"
        })
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          return {
            connected: false,
            message: body?.detail || `Server returned ${res.status}`
          }
        }
        const data = await res.json().catch(() => ({}))
        return {
          connected: data?.status === "ok",
          message: data?.message || "Backend is reachable"
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

    async testAI(modelOverride) {
      try {
        const model = modelOverride || aiConfig.default
        const res = await fetch(`${backendUrl}/test-ai`, {
          method: "GET",
          headers: {
            ...baseHeaders(),
            ...aiHeaders(model)
          }
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
          connected: !!data?.connected,
          message: data?.message || "AI test completed"
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

    async saveApplicationDraft(req) {
      const res = await fetch(`${backendUrl}/save-application-draft`, {
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
    },

    async getJob(jobId: string) {
      const res = await fetch(`${backendUrl}/job/${jobId}`, {
        method: "GET",
        headers: baseHeaders()
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.detail || `Server returned ${res.status}`)
      }
      const data = await res.json()
      return {
        ...data,
        qa_pairs: Array.isArray(data.qa_pairs) ? data.qa_pairs : [],
        resumes: Array.isArray(data.resumes) ? data.resumes : [],
        chat_messages: Array.isArray(data.chat_messages) ? data.chat_messages : []
      }
    },

    async saveQA(jobId: string, qaPairs: QAPairItem[]) {
      const res = await fetch(`${backendUrl}/save-qa`, {
        method: "POST",
        headers: {
          ...baseHeaders(),
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          job_id: jobId,
          qa_pairs: qaPairs
        })
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.detail || `Server returned ${res.status}`)
      }
      return await res.json()
    },

    async updateJob(req: JobMutation) {
      return this.logJob(req)
    },

    async getJobs() {
      const res = await fetch(`${backendUrl}/jobs`, {
        method: "GET",
        headers: baseHeaders()
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.detail || `Server returned ${res.status}`)
      }
      return await res.json()
    },

    async deleteJob(jobId: string) {
      const res = await fetch(`${backendUrl}/job/${jobId}`, {
        method: "DELETE",
        headers: baseHeaders()
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.detail || `Server returned ${res.status}`)
      }
    }
  }
}
