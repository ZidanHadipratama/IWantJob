/** Extracted form field from a page */
export interface FormField {
  field_id: string
  label: string
  name: string
  type: "text" | "textarea" | "select" | "checkbox" | "radio"
  options?: string[]
  required: boolean
  placeholder?: string
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
}
