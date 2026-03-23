export const OUTPUT_LANGUAGE_OPTIONS = [
  "English",
  "Bahasa Indonesia",
  "Malay",
  "Spanish",
  "French",
  "German",
  "Portuguese",
  "Japanese",
  "Korean",
  "Chinese (Simplified)"
] as const

export function normalizeOutputLanguage(value: unknown): string {
  if (typeof value !== "string") return "English"
  const trimmed = value.trim()
  return trimmed || "English"
}
