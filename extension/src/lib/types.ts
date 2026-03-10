export interface FormFieldOption {
  label: string
  value?: string
  selector?: string
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
