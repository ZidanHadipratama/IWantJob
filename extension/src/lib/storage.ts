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

export interface DraftQAPair {
  field_id: string
  label: string
  answer: string
  field_type: string
}

export interface InFlightRequest {
  id: string
  kind: "tailor_resume" | "generate_answers"
}

export interface ActiveJobContext {
  phase: "extracted" | "tailored"
  persistence_state: "draft" | "saved"
  job_id?: string | null
  job_description: string
  company: string
  job_title: string
  job_url: string
  page_title: string
  page_excerpt: string
  metadata_lines: string[]
  tailored_resume_json: object | null
  draft_qa_pairs: DraftQAPair[]
}

export interface ResumeSessionState {
  phase: string
  jobId?: string | null
  jdText: string
  company: string
  jobTitle: string
  jobUrl: string
  pageTitle: string
  pageExcerpt: string
  metadataLines: string[]
  tailoredJson: object | null
  matchScore: number
  inFlightRequest?: InFlightRequest | null
}

export interface FillFormSessionState {
  phase: string
  fields: object[]
  answers: object[]
  fieldCount: number
  frameId?: number | null
  includedFlaggedFieldIds?: string[]
  inFlightRequest?: InFlightRequest | null
}

export interface StorageSchema {
  ai_config: AIConfig
  db_config: DBConfig
  backend_url: string
  user_id: string
  persona_text: string
  base_resume_text: string
  base_resume_json: object | null
  debug_log: string[]
  // Session state — persists across tab switches
  resume_session: ResumeSessionState | null
  active_job_context: ActiveJobContext | null
  fillform_session: FillFormSessionState | null
  sidepanel_active_tab: "resume" | "fill-form" | "tracker"
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : ""
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []
}

function asObjectArray(value: unknown): object[] {
  return Array.isArray(value) ? value.filter((item): item is object => Boolean(item) && typeof item === "object") : []
}

function asInFlightRequest(value: unknown): InFlightRequest | null {
  if (!value || typeof value !== "object") return null

  const request = value as Partial<InFlightRequest>
  const id = asString(request.id)
  const kind = request.kind === "tailor_resume" || request.kind === "generate_answers"
    ? request.kind
    : null

  if (!id || !kind) return null

  return { id, kind }
}

export function normalizeResumeSession(raw: unknown): ResumeSessionState | null {
  if (!raw || typeof raw !== "object") return null

  const session = raw as Partial<ResumeSessionState>
  const jdText = asString(session.jdText).trim()
  const phase = session.phase === "tailored" && session.tailoredJson ? "tailored" : session.phase === "extracted" ? "extracted" : "idle"

  if (!jdText || phase === "idle") return null

  return {
    phase,
    jobId: typeof session.jobId === "string" ? session.jobId : null,
    jdText,
    company: asString(session.company),
    jobTitle: asString(session.jobTitle),
    jobUrl: asString(session.jobUrl),
    pageTitle: asString(session.pageTitle),
    pageExcerpt: asString(session.pageExcerpt),
    metadataLines: asStringArray(session.metadataLines),
    tailoredJson: session.tailoredJson && typeof session.tailoredJson === "object" ? session.tailoredJson : null,
    matchScore: typeof session.matchScore === "number" ? session.matchScore : 0,
    inFlightRequest: asInFlightRequest(session.inFlightRequest)
  }
}

export function normalizeFillFormSession(raw: unknown): FillFormSessionState | null {
  if (!raw || typeof raw !== "object") return null

  const session = raw as Partial<FillFormSessionState>
  const phase = session.phase === "answered" ? "answered" : session.phase === "extracted" ? "extracted" : "idle"
  if (phase === "idle") return null

  const fields = asObjectArray(session.fields)
  const answers = asObjectArray(session.answers)
  const fieldCount = typeof session.fieldCount === "number" ? session.fieldCount : fields.length

  if (phase === "extracted" && fields.length === 0) return null
  if (phase === "answered" && answers.length === 0) return null

  return {
    phase,
    fields,
    answers,
    fieldCount,
    frameId: typeof session.frameId === "number" ? session.frameId : null,
    includedFlaggedFieldIds: asStringArray(session.includedFlaggedFieldIds),
    inFlightRequest: asInFlightRequest(session.inFlightRequest)
  }
}

export function normalizeActiveJobContext(raw: unknown): ActiveJobContext | null {
  if (!raw || typeof raw !== "object") return null

  const context = raw as Partial<ActiveJobContext>
  const jobDescription = asString(context.job_description).trim()
  if (!jobDescription) return null

  const tailoredResume =
    context.tailored_resume_json && typeof context.tailored_resume_json === "object"
      ? context.tailored_resume_json
      : null

  const phase: ActiveJobContext["phase"] =
    context.phase === "tailored" && tailoredResume ? "tailored" : "extracted"
  const jobId = typeof context.job_id === "string" && context.job_id ? context.job_id : null
  const persistenceState: ActiveJobContext["persistence_state"] =
    context.persistence_state === "saved" && jobId ? "saved" : "draft"
  const draftQAPairs = Array.isArray(context.draft_qa_pairs)
    ? context.draft_qa_pairs
        .filter((pair): pair is DraftQAPair => Boolean(pair) && typeof pair === "object")
        .map((pair) => ({
          field_id: asString(pair.field_id),
          label: asString(pair.label),
          answer: asString(pair.answer),
          field_type: asString(pair.field_type) || "text"
        }))
        .filter((pair) => pair.field_id || pair.label || pair.answer)
    : []

  return {
    phase,
    persistence_state: persistenceState,
    job_id: jobId,
    job_description: jobDescription,
    company: asString(context.company),
    job_title: asString(context.job_title),
    job_url: asString(context.job_url),
    page_title: asString(context.page_title),
    page_excerpt: asString(context.page_excerpt),
    metadata_lines: asStringArray(context.metadata_lines),
    tailored_resume_json: tailoredResume,
    draft_qa_pairs: draftQAPairs
  }
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
