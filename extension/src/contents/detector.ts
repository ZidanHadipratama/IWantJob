import type { PlasmoCSConfig } from "plasmo"
import { Readability } from "@mozilla/readability"

export const config: PlasmoCSConfig = {
  matches: ["<all_urls>"],
  run_at: "document_idle"
}

// ── Types ────────────────────────────────────────────────────────────────

interface FormField {
  field_id: string
  label: string
  name: string
  type: "text" | "textarea" | "select" | "checkbox" | "radio"
  options?: string[]
  required: boolean
  placeholder?: string
}

// ── JD Extraction ────────────────────────────────────────────────────────

const JD_MAX_LENGTH = 15000
const MAIN_CONTENT_SELECTOR =
  "main, article, [role='main'], .job-description, .jd-description, " +
  "#job-description, .posting-page, .job-details, .job-posting"
const BLOCK_TAGS = new Set(["ARTICLE", "ASIDE", "BLOCKQUOTE", "DD", "DIV", "DT", "H1", "H2", "H3", "H4", "H5", "H6", "LI", "OL", "P", "SECTION", "UL"])
const METADATA_LABEL_RE =
  /^(location|location type|employment type|job type|work type|workplace|department|team|compensation|salary|pay|schedule|commitment|experience level|seniority|timezone|time zone|work authorization|visa)$/i
const BOILERPLATE_RE =
  /^(apply now|sign in|sign up|share this job|save job|report job|back to jobs|cookie preferences|privacy policy|terms of service)$/i

function pruneForReadability(doc: Document) {
  const selectors = [
    "script",
    "style",
    "noscript",
    "svg",
    "nav",
    "header",
    "footer",
    "aside",
    "[role='navigation']",
    "[aria-label*='breadcrumb' i]",
    "[class*='breadcrumb']",
    "[class*='cookie']",
    "[class*='modal']",
    "[class*='drawer']",
    "[class*='sidebar']",
    "[class*='header']",
    "[class*='footer']",
    "[class*='nav']",
    "[data-testid*='header']",
    "[data-testid*='footer']",
    "[data-testid*='navigation']"
  ]

  doc.querySelectorAll(selectors.join(", ")).forEach((el) => el.remove())
}

function normalizeInlineText(text: string): string {
  return text
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\s+([:;,.!?])/g, "$1")
    .trim()
}

function getElementText(el: HTMLElement): string {
  return normalizeInlineText(el.innerText || el.textContent || "")
}

function linkDensity(el: HTMLElement): number {
  const totalText = getElementText(el)
  if (!totalText) return 0
  const linkText = Array.from(el.querySelectorAll("a"))
    .map((link) => getElementText(link as HTMLElement))
    .join(" ")
  return linkText.length / totalText.length
}

function isMetadataLabel(text: string): boolean {
  if (METADATA_LABEL_RE.test(text)) return true
  return /^[A-Z][A-Za-z/& -]{1,32}$/.test(text) && text.split(" ").length <= 4
}

function extractMetadataLine(el: HTMLElement): string | null {
  const childTexts = Array.from(el.children)
    .map((child) => getElementText(child as HTMLElement))
    .filter((text) => text && text.length <= 120)

  if (childTexts.length < 2 || childTexts.length > 4) return null
  if (!isMetadataLabel(childTexts[0])) return null

  const value = childTexts.slice(1).join(" | ")
  if (!value || value.length > 180 || BOILERPLATE_RE.test(value)) return null

  return `${childTexts[0]}: ${value}`
}

function hasMeaningfulBlockChildren(el: HTMLElement): boolean {
  return Array.from(el.children).some((child) => {
    const childEl = child as HTMLElement
    if (!BLOCK_TAGS.has(childEl.tagName)) return false
    const text = getElementText(childEl)
    return text.length > 40
  })
}

function extractLeafBlockText(el: HTMLElement): string | null {
  const text = getElementText(el)
  if (!text || BOILERPLATE_RE.test(text) || linkDensity(el) > 0.35) return null

  if (/^H[1-6]$/.test(el.tagName)) {
    return text.length <= 140 ? text : null
  }

  if (!BLOCK_TAGS.has(el.tagName) || hasMeaningfulBlockChildren(el)) return null
  if (text.length < 20 || text.length > 1200) return null

  return text
}

function collectStructuredContent(root: HTMLElement): { metadataLines: string[]; bodyBlocks: string[] } {
  const metadataLines: string[] = []
  const bodyBlocks: string[] = []
  const seen = new Set<string>()

  function push(target: string[], text: string) {
    const normalized = normalizeInlineText(text)
    if (!normalized || seen.has(normalized)) return
    seen.add(normalized)
    target.push(normalized)
  }

  function visit(el: HTMLElement) {
    const metadataLine = extractMetadataLine(el)
    if (metadataLine) {
      push(metadataLines, metadataLine)
      return
    }

    const leafText = extractLeafBlockText(el)
    if (leafText) {
      push(bodyBlocks, leafText)
      return
    }

    Array.from(el.children).forEach((child) => visit(child as HTMLElement))
  }

  visit(root)
  return {
    metadataLines: metadataLines.slice(0, 12),
    bodyBlocks: bodyBlocks.slice(0, 160)
  }
}

function tidyJDText(text: string): string {
  const cleaned = text
    .replace(/\u00a0/g, " ")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")

  const sectionPattern =
    /^(about the role|about us|overview|summary|responsibilities|requirements|qualifications|preferred qualifications|nice to have|what you'll do|what you will do|what we're looking for|what we are looking for|benefits|compensation|salary|location|employment type|job type|experience|skills)\b/i

  const noisePattern =
    /^(apply now|sign in|sign up|share this job|save job|report job|back to jobs|cookie preferences|privacy policy|terms of service)$/i

  const lines = cleaned
    .split("\n")
    .map((line) => line.trim())
    .filter((line, index, arr) => {
      if (!line || noisePattern.test(line)) return false
      if (index > 0 && arr[index - 1] === line) return false
      return true
    })

  const output: string[] = []
  for (const line of lines) {
    const normalizedLine = line.replace(/\s{2,}/g, " ")
    if (sectionPattern.test(normalizedLine) && output.length > 0 && output[output.length - 1] !== "") {
      output.push("")
    }
    output.push(normalizedLine)
  }

  const tidy = output.join("\n").replace(/\n{3,}/g, "\n\n").trim()
  return tidy.length > JD_MAX_LENGTH ? tidy.slice(0, JD_MAX_LENGTH) : tidy
}

function buildJDText(metadataLines: string[], bodyText: string, fallbackBlocks: string[]): string {
  const normalizedBody = tidyJDText(bodyText)
  const missingMetadata = metadataLines.filter(
    (line) => !normalizedBody.toLowerCase().includes(line.toLowerCase())
  )
  const fallbackText = tidyJDText(fallbackBlocks.join("\n\n"))
  const merged = [missingMetadata.join("\n"), normalizedBody || fallbackText]
    .filter(Boolean)
    .join("\n\n")

  return tidyJDText(merged || fallbackText)
}

function extractJD(): { text: string; page_title?: string; company?: string; job_title?: string; metadata_lines?: string[]; readability_title?: string; readability_excerpt?: string; readability_siteName?: string; used_readability: boolean } {
  const body = document.body
  if (!body) return { text: "", used_readability: false }

  // Try Mozilla Readability first
  const clone = document.cloneNode(true) as Document
  pruneForReadability(clone)
  const sourceRoot =
    (clone.body.querySelector(MAIN_CONTENT_SELECTOR) as HTMLElement | null) || clone.body
  const structured = collectStructuredContent(sourceRoot)
  const article = new Readability(clone).parse()

  if (article?.textContent && article.textContent.trim().length > 100) {
    const articleDoc = article.content
      ? new DOMParser().parseFromString(article.content, "text/html")
      : null
    const readabilityText = articleDoc?.body?.innerText || article.textContent
    const trimmed = buildJDText(structured.metadataLines, readabilityText, structured.bodyBlocks)

    return {
      text: trimmed,
      page_title: document.title || article.title || undefined,
      company: extractCompany() || article.siteName || undefined,
      job_title: extractJobTitle() || article.title || undefined,
      metadata_lines: structured.metadataLines,
      readability_title: article.title || undefined,
      readability_excerpt: article.excerpt || undefined,
      readability_siteName: article.siteName || undefined,
      used_readability: true
    }
  }

  // Fallback: manual selector-based extraction
  const mainEl = body.querySelector(MAIN_CONTENT_SELECTOR) as HTMLElement | null

  const container = mainEl || body
  const fallbackStructured = collectStructuredContent(container)
  const trimmed = buildJDText(
    fallbackStructured.metadataLines,
    container.innerText || "",
    fallbackStructured.bodyBlocks
  )

  return {
    text: trimmed,
    page_title: document.title || undefined,
    company: extractCompany(),
    job_title: extractJobTitle(),
    metadata_lines: fallbackStructured.metadataLines,
    used_readability: false
  }
}

function extractCompany(): string | undefined {
  const selectors = [
    "[data-company]",
    ".company-name",
    ".employer-name",
    ".posting-categories .company",
    'meta[property="og:site_name"]'
  ]
  for (const sel of selectors) {
    const el = document.querySelector(sel)
    if (el) {
      const text = el instanceof HTMLMetaElement ? el.content : el.textContent
      if (text?.trim()) return text.trim()
    }
  }
  return undefined
}

function extractJobTitle(): string | undefined {
  const selectors = [
    "h1.job-title",
    "h1.posting-headline",
    ".job-title h1",
    'h1[data-job-title]',
    ".top-card-layout__title",
    ".jobs-unified-top-card__job-title"
  ]
  for (const sel of selectors) {
    const el = document.querySelector(sel)
    if (el?.textContent?.trim()) return el.textContent.trim()
  }
  // Fallback: first h1 if short enough
  const h1 = document.querySelector("h1")
  if (h1?.textContent?.trim() && h1.textContent.trim().length < 100) {
    return h1.textContent.trim()
  }
  return undefined
}

// ── Form Extraction ──────────────────────────────────────────────────────

const SKIP_TYPES = new Set(["hidden", "submit", "button", "image", "reset", "file"])
const GENERIC_PLACEHOLDER_RE =
  /^(start typing|type here|enter here|your answer|answer here|write here|select|choose|search|optional|type here\.\.\.|start typing\.\.\.)$/i

function extractFormFields(): FormField[] {
  const fields: FormField[] = []
  const seen = new Set<string>()
  const seenRadioNames = new Set<string>()

  const inputs = document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
    "input, textarea, select"
  )

  for (const el of inputs) {
    if (el instanceof HTMLInputElement && SKIP_TYPES.has(el.type)) continue
    if (!el.offsetParent && el.type !== "hidden") continue

    // Deduplicate radios by name (they share a name but have unique ids)
    if (el instanceof HTMLInputElement && el.type === "radio" && el.name) {
      if (seenRadioNames.has(el.name)) continue
      seenRadioNames.add(el.name)
    }

    const fieldId = el.id || el.name || `field-${fields.length}`
    if (seen.has(fieldId)) continue
    seen.add(fieldId)

    const label = findLabel(el)
    if (!label) continue

    const field: FormField = {
      field_id: fieldId,
      label,
      name: el.name || "",
      type: getFieldType(el),
      required: el.required || el.getAttribute("aria-required") === "true",
    }

    if ("placeholder" in el && el.placeholder) {
      field.placeholder = el.placeholder
    }

    if (isPlaceholderOnlyJunkField(el, label, field.field_id)) continue

    if (el instanceof HTMLSelectElement) {
      field.options = Array.from(el.options)
        .map(o => o.text.trim())
        .filter(t => t && t !== "Select..." && t !== "Choose..." && t !== "--")
    }

    if (el instanceof HTMLInputElement && (el.type === "radio" || el.type === "checkbox")) {
      // Find the group question from a parent container
      const groupQuestion = findGroupLabel(el)
      if (groupQuestion) {
        field.label = groupQuestion
      }

      if (el.type === "radio") {
        const radios = document.querySelectorAll<HTMLInputElement>(`input[name="${el.name}"]`)
        field.options = Array.from(radios).map(r => {
          const radioLabel = findLabel(r)
          return radioLabel || r.value
        }).filter(Boolean)
      }

      if (el.type === "checkbox") {
        // Walk up the DOM to find a container with multiple checkboxes
        let container: HTMLElement | null = el.parentElement
        for (let i = 0; i < 6 && container; i++) {
          const checkboxes = container.querySelectorAll<HTMLInputElement>("input[type='checkbox']")
          if (checkboxes.length > 1) {
            field.options = Array.from(checkboxes).map(cb => {
              const cbLabel = findLabel(cb)
              return cbLabel || cb.value
            }).filter(Boolean)
            // Mark all sibling checkboxes as seen so we don't duplicate
            checkboxes.forEach(cb => {
              const cbId = cb.id || cb.name || ""
              if (cbId) seen.add(cbId)
            })
            break
          }
          container = container.parentElement
        }
      }
    }

    fields.push(field)
  }

  return fields
}

/** Get clean text from an element, stripping SVGs and form controls */
function cleanText(el: Element): string {
  const clone = el.cloneNode(true) as HTMLElement
  clone.querySelectorAll("svg, input, textarea, select").forEach(c => c.remove())
  return clone.textContent?.trim() || ""
}

function findLabel(el: HTMLElement): string {
  if (el.id) {
    const label = document.querySelector(`label[for="${CSS.escape(el.id)}"]`)
    if (label) {
      const text = cleanText(label)
      if (text) return text
    }
  }
  const ariaLabel = el.getAttribute("aria-label")
  if (ariaLabel?.trim()) return ariaLabel.trim()
  const labelledBy = el.getAttribute("aria-labelledby")
  if (labelledBy) {
    const labelEl = document.getElementById(labelledBy)
    if (labelEl) {
      const text = cleanText(labelEl)
      if (text) return text
    }
  }
  const parentLabel = el.closest("label")
  if (parentLabel) {
    const text = cleanText(parentLabel)
    if (text) return text
  }
  const prev = el.previousElementSibling
  if (prev && (prev.tagName === "LABEL" || prev.tagName === "SPAN" || prev.tagName === "P")) {
    const text = cleanText(prev)
    if (text) return text
  }
  if ("placeholder" in el && (el as HTMLInputElement).placeholder) {
    const placeholder = (el as HTMLInputElement).placeholder.trim()
    if (placeholder && !GENERIC_PLACEHOLDER_RE.test(placeholder)) {
      return placeholder
    }
  }
  return ""
}

function isPlaceholderOnlyJunkField(el: HTMLElement, label: string, fieldId: string): boolean {
  const placeholder = "placeholder" in el ? (el as HTMLInputElement).placeholder?.trim() || "" : ""
  const hasRealIdentifier = Boolean((el as HTMLInputElement).id || (el as HTMLInputElement).name)

  if (!label) return true
  if (!placeholder) return false
  if (label !== placeholder) return false
  if (hasRealIdentifier && !GENERIC_PLACEHOLDER_RE.test(label)) return false
  if (fieldId.startsWith("field-")) return true
  return GENERIC_PLACEHOLDER_RE.test(label)
}

/** Find the group question for radio/checkbox inputs.
 *  Walks up the DOM looking for fieldset/legend, role=group, or a preceding text element. */
function findGroupLabel(el: HTMLElement): string {
  // 1. fieldset > legend
  const fieldset = el.closest("fieldset")
  if (fieldset) {
    const legend = fieldset.querySelector("legend")
    if (legend) {
      const text = cleanText(legend)
      if (text) return text
    }
  }

  // 2. role="group" or role="radiogroup" with aria-labelledby
  const group = el.closest("[role='group'], [role='radiogroup']")
  if (group) {
    const labelledBy = group.getAttribute("aria-labelledby")
    if (labelledBy) {
      const labelEl = document.getElementById(labelledBy)
      if (labelEl) {
        const text = cleanText(labelEl)
        if (text) return text
      }
    }
    const ariaLabel = group.getAttribute("aria-label")
    if (ariaLabel?.trim()) return ariaLabel.trim()
  }

  // 3. Walk up to find a container that has a heading, label, or paragraph before the options
  let container = el.parentElement
  for (let i = 0; i < 5 && container; i++) {
    // Look for a text element (h1-h6, p, span, label, legend) that's a direct child
    // and appears before the inputs
    for (const child of container.children) {
      // Stop if we've reached the input itself or its wrapper
      if (child.contains(el)) break
      const tag = child.tagName
      if (["H1","H2","H3","H4","H5","H6","P","SPAN","LABEL","LEGEND","DIV"].includes(tag)) {
        const text = cleanText(child)
        // Must be question-like (not too short, not too long)
        if (text && text.length > 3 && text.length < 500) return text
      }
    }
    container = container.parentElement
  }

  return ""
}

function getFieldType(el: HTMLElement): FormField["type"] {
  if (el instanceof HTMLTextAreaElement) return "textarea"
  if (el instanceof HTMLSelectElement) return "select"
  if (el instanceof HTMLInputElement) {
    if (el.type === "checkbox") return "checkbox"
    if (el.type === "radio") return "radio"
  }
  return "text"
}

// ── Message Handler ──────────────────────────────────────────────────────
// Side panel sends messages, content script responds with extracted data.

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === "EXTRACT_JD") {
    const result = extractJD()
    sendResponse({
      success: true,
      url: window.location.href,
      ...result
    })
  }

  if (msg.type === "EXTRACT_FORM") {
    const fields = extractFormFields()
    sendResponse({
      success: true,
      url: window.location.href,
      fields
    })
  }

  // Return true to keep the message channel open for async response
  return true
})
