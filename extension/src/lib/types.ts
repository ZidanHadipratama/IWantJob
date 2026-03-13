export interface FormFieldOption {
  label: string
  value?: string
  selector?: string
}

export interface ResumeContact {
  name?: string
  email?: string
  phone?: string
  location?: string
  linkedin?: string
  github?: string
  website?: string
  work_authorization?: string
}

export interface ResumeSkills {
  languages?: string[]
  frameworks?: string[]
  tools?: string[]
  other?: string[]
}

export interface ResumeSectionEntry {
  heading: string
  subheading?: string
  dates?: string
  location?: string
  url?: string
  bullets: string[]
}

export interface ResumeSection {
  title: string
  entries: ResumeSectionEntry[]
}

export interface ResumeJson {
  contact: ResumeContact
  summary?: string
  skills?: ResumeSkills
  sections: ResumeSection[]
}

export interface StructuredJobDescription {
  role_focus?: string | null
  must_have_skills: string[]
  preferred_skills: string[]
  responsibilities: string[]
  domain_keywords: string[]
  seniority?: string | null
  work_mode?: string | null
  employment_type?: string | null
}

export type FormFieldAISkipKind =
  | "oversized-options"
  | "noisy-label"
  | "label-too-large"
  | "composite-phone"
  | "file-upload"
  | "unsupported-combobox"

/** Extracted form field from a page */
export interface FormField {
  field_id: string
  label: string
  name: string
  type: "text" | "textarea" | "select" | "combobox" | "checkbox" | "radio" | "file"
  options?: FormFieldOption[]
  required: boolean
  placeholder?: string
  selector?: string
  input_type?: string
  ai_skip_reason?: string
  ai_skip_kind?: FormFieldAISkipKind
}

/** Response from EXTRACT_JD message to content script */
export interface ExtractJDResponse {
  success: boolean
  url: string
  text: string
  page_title?: string
  company?: string
  job_title?: string
  metadata_lines?: string[]
  readability_title?: string
  readability_excerpt?: string
  readability_siteName?: string
  used_readability: boolean
}

/** Response from EXTRACT_FORM message to content script */
export interface ExtractFormResponse {
  success: boolean
  url: string
  fields: FormField[]
  frame_id?: number
}

export interface AutofillAnswerInput {
  field_id: string
  label: string
  answer: string
  field_type: string
}

export interface AutofillResumeFilePayload {
  filename: string
  mime_type: string
  base64_data: string
}

export interface AutofillResultItem {
  field_id: string
  label: string
  status: "filled" | "skipped" | "failed"
  reason?: string
}

export interface AutofillFormResponse {
  success: boolean
  url: string
  results?: AutofillResultItem[]
  frame_id?: number
  error?: string
}
