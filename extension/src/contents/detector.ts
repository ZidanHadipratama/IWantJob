import type { PlasmoCSConfig } from "plasmo"
import { Readability } from "@mozilla/readability"
import type {
  AutofillAnswerInput,
  AutofillResultItem,
  AutofillResumeFilePayload,
  FormField,
  FormFieldOption
} from "~lib/types"

export const config: PlasmoCSConfig = {
  matches: ["<all_urls>"],
  run_at: "document_idle"
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
    .replace(/SVGs not supported by this browser\./gi, " ")
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

const SKIP_TYPES = new Set(["hidden", "submit", "button", "image", "reset"])
const GENERIC_PLACEHOLDER_RE =
  /^(start typing|type here|enter here|your answer|answer here|write here|select|choose|search|optional|type here\.\.\.|start typing\.\.\.)$/i
const AI_OPTION_SKIP_THRESHOLD = 10
const PHONE_FIELD_RE = /(phone|mobile|tel|whatsapp|contact[-_ ]?number)/i
const SELECT_LIKE_PLACEHOLDER_RE = /^select an option/i

function looksLikeOptionBlob(text: string): boolean {
  const normalized = normalizeInlineText(text)
  if (!normalized) return false
  if (normalized.length > 220) return true
  if ((normalized.match(/\+\d{1,3}/g) || []).length >= 5) return true
  if ((normalized.match(/[A-Z][a-z]+(?: [A-Z][a-z]+)?\+\d{1,3}/g) || []).length >= 4) return true
  if ((normalized.match(/[A-Z][a-z]+(?: [A-Z][a-z]+)?/g) || []).length >= 20 && normalized.includes("+")) return true
  return false
}

function looksLikePhoneField(el: HTMLElement, fieldId: string, label: string): boolean {
  const input = el instanceof HTMLInputElement ? el : null
  const candidates = [
    fieldId,
    el.getAttribute("name") || "",
    input?.type || "",
    label
  ].join(" ")

  return PHONE_FIELD_RE.test(candidates)
}

function sanitizeFieldLabel(el: HTMLElement, fieldId: string, fieldType: FormField["type"], rawLabel: string): {
  label: string
  aiSkipReason?: string
  aiSkipKind?: FormField["ai_skip_kind"]
} {
  const label = normalizeInlineText(rawLabel)

  if (!label) {
    return { label: "" }
  }

  if (looksLikeOptionBlob(label)) {
    if (looksLikePhoneField(el, fieldId, label)) {
      return {
        label: "Phone",
        aiSkipReason: "Composite phone field with country picker; complete manually",
        aiSkipKind: "composite-phone"
      }
    }

    if (fieldType === "select" || fieldType === "radio" || fieldType === "checkbox") {
      return {
        label: label.slice(0, 120),
        aiSkipReason: "Noisy field label; complete manually",
        aiSkipKind: "noisy-label"
      }
    }
  }

  if (label.length > 240) {
    return {
      label: label.slice(0, 120),
      aiSkipReason: "Field label is too large for one AI pass",
      aiSkipKind: "label-too-large"
    }
  }

  return { label }
}

function dedupeOptions(options: Array<FormFieldOption | null | undefined>): FormFieldOption[] {
  const seen = new Set<string>()
  const deduped: FormFieldOption[] = []

  for (const option of options) {
    if (!option) continue
    const key = `${normalizeInlineText(option.label || "")}::${option.value || ""}`
    if (!key || seen.has(key)) continue
    seen.add(key)
    deduped.push(option)
  }

  return deduped
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

function getUniqueAttributeSelector(el: HTMLElement): string | null {
  const tag = el.tagName.toLowerCase()

  if (el.id) {
    return `#${CSS.escape(el.id)}`
  }

  const attributes = [
    ["name", el.getAttribute("name")],
    ["data-testid", el.getAttribute("data-testid")],
    ["data-test", el.getAttribute("data-test")],
    ["data-qa", el.getAttribute("data-qa")],
    ["aria-label", el.getAttribute("aria-label")]
  ] as const

  for (const [attr, value] of attributes) {
    if (!value?.trim()) continue
    const selector = `${tag}[${attr}="${CSS.escape(value)}"]`
    if (document.querySelectorAll(selector).length === 1) return selector
  }

  if (el instanceof HTMLInputElement && el.type) {
    const inputSelector = `${tag}[type="${CSS.escape(el.type)}"]`
    if (el.name) {
      const selector = `${inputSelector}[name="${CSS.escape(el.name)}"]`
      if (document.querySelectorAll(selector).length === 1) return selector
    }
  }

  return null
}

function buildNthOfTypeSelector(el: HTMLElement, depth = 0): string {
  const tag = el.tagName.toLowerCase()
  const parent = el.parentElement

  if (!parent || depth >= 5) return tag

  const siblings = Array.from(parent.children).filter(
    (child) => child.tagName === el.tagName
  )
  const index = siblings.indexOf(el) + 1
  const ownSelector = siblings.length > 1 ? `${tag}:nth-of-type(${index})` : tag
  const parentUnique = getUniqueAttributeSelector(parent)

  if (parentUnique) {
    return `${parentUnique} > ${ownSelector}`
  }

  return `${buildNthOfTypeSelector(parent, depth + 1)} > ${ownSelector}`
}

function buildElementSelector(el: HTMLElement): string {
  return getUniqueAttributeSelector(el) || buildNthOfTypeSelector(el)
}

function buildOption(label: string, value: string | null | undefined, el: HTMLElement): FormFieldOption | null {
  const normalizedLabel = normalizeInlineText(label)
  const normalizedValue = value?.trim()

  if (!normalizedLabel && !normalizedValue) return null

  return {
    label: normalizedLabel || normalizedValue || "",
    value: normalizedValue || undefined,
    selector: buildElementSelector(el)
  }
}

function isVisibleElement(el: Element | null): el is HTMLElement {
  return Boolean(el instanceof HTMLElement && (el.offsetParent || el.getClientRects().length))
}

function isComboboxLikeInput(el: HTMLElement): boolean {
  if (!(el instanceof HTMLInputElement)) return false
  if (el.type && el.type !== "text" && el.type !== "search") return false

  const placeholder = normalizeInlineText(el.placeholder || "")
  const role = el.getAttribute("role") || ""
  const ariaAutocomplete = el.getAttribute("aria-autocomplete") || ""
  const ariaHasPopup = el.getAttribute("aria-haspopup") || ""
  const hasInputIdPattern = /^input_.+_input$/.test(el.id || "")

  return (
    SELECT_LIKE_PLACEHOLDER_RE.test(placeholder) ||
    role === "combobox" ||
    ariaAutocomplete === "list" ||
    ariaHasPopup === "listbox" ||
    hasInputIdPattern
  )
}

function findComboboxBackingInput(el: HTMLInputElement): HTMLInputElement | null {
  const derivedName =
    el.id.startsWith("input_") && el.id.endsWith("_input")
      ? el.id.slice("input_".length, -"_input".length)
      : ""

  if (derivedName) {
    const derived = document.querySelector<HTMLInputElement>(`input[name="${CSS.escape(derivedName)}"]`)
    if (derived && derived !== el) return derived
  }

  const container = el.closest("[data-ui], label, div, fieldset") || el.parentElement
  if (container) {
    const nearby = Array.from(container.querySelectorAll<HTMLInputElement>("input"))
      .find((candidate) => candidate !== el && Boolean(candidate.name))
    if (nearby) return nearby
  }

  return null
}

function getComboboxOptionNodes(el: HTMLInputElement): HTMLElement[] {
  const controlledIds = [
    el.getAttribute("aria-controls") || "",
    el.getAttribute("aria-owns") || ""
  ].filter(Boolean)

  for (const id of controlledIds) {
    const target = document.getElementById(id)
    if (!target) continue
    const nodes = Array.from(target.querySelectorAll<HTMLElement>("[role='option'], li, [data-option-index]"))
      .filter((node) => isVisibleElement(node))
    if (nodes.length > 0) return nodes
  }

  const visibleListboxes = Array.from(document.querySelectorAll<HTMLElement>("[role='listbox']"))
    .filter((node) => isVisibleElement(node))

  for (const listbox of visibleListboxes) {
    const nodes = Array.from(listbox.querySelectorAll<HTMLElement>("[role='option'], li, [data-option-index]"))
      .filter((node) => isVisibleElement(node))
    if (nodes.length > 0) return nodes
  }

  return Array.from(document.querySelectorAll<HTMLElement>("[role='option']"))
    .filter((node) => isVisibleElement(node))
}

async function collectComboboxOptions(el: HTMLInputElement): Promise<FormFieldOption[]> {
  el.focus()
  el.click()
  el.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }))

  for (const waitMs of [80, 180, 320]) {
    await delay(waitMs)
    const nodes = getComboboxOptionNodes(el)
    const options = dedupeOptions(
      nodes.map((node) => buildOption(node.textContent || "", node.getAttribute("data-value"), node))
    )
      .filter((option) => option.label)
      .filter((option) => !/^(select an option|no options|loading)$/i.test(option.label))

    if (options.length > 0) {
      el.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
      return options
    }
  }

  el.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
  return []
}

async function extractFormFields(): Promise<FormField[]> {
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

    const rawLabel = findLabel(el)
    if (!rawLabel) continue

    const initialType = getFieldType(el)
    const comboboxBackingInput = initialType === "combobox" && el instanceof HTMLInputElement
      ? findComboboxBackingInput(el)
      : null

    const field: FormField = {
      field_id: fieldId,
      label: "",
      name: comboboxBackingInput?.name || el.name || "",
      type: initialType,
      required: el.required || el.getAttribute("aria-required") === "true",
      selector: buildElementSelector(el),
      input_type: el instanceof HTMLInputElement ? el.type || "text" : undefined
    }

    if ("placeholder" in el && el.placeholder) {
      field.placeholder = el.placeholder
    }

    if (isPlaceholderOnlyJunkField(el, rawLabel, field.field_id)) continue

    const sanitized = sanitizeFieldLabel(el, field.field_id, field.type, rawLabel)
    if (!sanitized.label) continue
    field.label = sanitized.label
    if (sanitized.aiSkipReason) {
      field.ai_skip_reason = sanitized.aiSkipReason
      if (sanitized.aiSkipKind) {
        field.ai_skip_kind = sanitized.aiSkipKind
      }
    }

    if (el instanceof HTMLSelectElement) {
      field.options = dedupeOptions(Array.from(el.options)
        .map((option) => buildOption(option.text.trim(), option.value, el))
        .filter((option): option is FormFieldOption => Boolean(option))
        .filter((option) => option.label && option.label !== "Select..." && option.label !== "Choose..." && option.label !== "--"))
    }

    if (field.type === "combobox" && el instanceof HTMLInputElement) {
      field.options = await collectComboboxOptions(el)
      if (!field.options.length) {
        field.ai_skip_reason = "Custom combobox options could not be extracted; complete manually"
        field.ai_skip_kind = "unsupported-combobox"
      }
    }

    if (el instanceof HTMLInputElement && (el.type === "radio" || el.type === "checkbox")) {
      // Find the group question from a parent container
      const groupQuestion = findGroupLabel(el)
      if (groupQuestion) {
        field.label = groupQuestion
      }

      if (el.type === "radio") {
        const radios = document.querySelectorAll<HTMLInputElement>(`input[name="${el.name}"]`)
        field.options = dedupeOptions(Array.from(radios).map(r => {
          const radioLabel = findLabel(r)
          return buildOption(radioLabel || r.value, r.value, r)
        }).filter((option): option is FormFieldOption => Boolean(option)))
      }

      if (el.type === "checkbox") {
        // Walk up the DOM to find a container with multiple checkboxes
        let container: HTMLElement | null = el.parentElement
        for (let i = 0; i < 6 && container; i++) {
          const checkboxes = container.querySelectorAll<HTMLInputElement>("input[type='checkbox']")
          if (checkboxes.length > 1) {
            field.options = dedupeOptions(Array.from(checkboxes).map(cb => {
              const cbLabel = findLabel(cb)
              return buildOption(cbLabel || cb.value, cb.value, cb)
            }).filter((option): option is FormFieldOption => Boolean(option)))
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

    if (
      !field.ai_skip_reason &&
      (field.type === "select" || field.type === "combobox" || field.type === "radio" || field.type === "checkbox") &&
      (field.options?.length || 0) > AI_OPTION_SKIP_THRESHOLD
    ) {
      field.ai_skip_reason = `Too many options (${field.options?.length || 0}) for one AI pass`
      field.ai_skip_kind = "oversized-options"
    }

    if (field.type === "file" && !field.ai_skip_reason) {
      field.ai_skip_reason = "Handled during autofill"
      field.ai_skip_kind = "file-upload"
    }

    fields.push(field)
  }

  return fields
}

/** Get clean text from an element, stripping SVGs and form controls */
function cleanText(el: Element): string {
  const clone = el.cloneNode(true) as HTMLElement
  clone.querySelectorAll("svg, img, input, textarea, select").forEach(c => c.remove())
  return normalizeInlineText(clone.textContent || "")
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
    if (isComboboxLikeInput(el)) return "combobox"
    if (el.type === "file") return "file"
    if (el.type === "checkbox") return "checkbox"
    if (el.type === "radio") return "radio"
  }
  return "text"
}

function normalizeChoice(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
}

function splitSelections(value: string): string[] {
  return value
    .split(/\n|,|;/)
    .map((part) => normalizeInlineText(part))
    .filter(Boolean)
}

function resolveFieldElement(field: FormField): HTMLElement | null {
  if (field.selector) {
    try {
      const bySelector = document.querySelector(field.selector)
      if (bySelector instanceof HTMLElement) return bySelector
    } catch {
      // Fall back to id/name lookup if the stored selector is no longer valid on this page.
    }
  }

  if (field.field_id) {
    const byId = document.getElementById(field.field_id)
    if (byId instanceof HTMLElement) return byId
  }

  if (field.name) {
    const byName = document.querySelector(`[name="${CSS.escape(field.name)}"]`)
    if (byName instanceof HTMLElement) return byName
  }

  return null
}

function getCheckedSetter(el: HTMLInputElement): ((this: HTMLInputElement, value: boolean) => void) | undefined {
  return Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), "checked")?.set
    || Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "checked")?.set
}

function setNativeValue(
  el: HTMLInputElement | HTMLTextAreaElement,
  value: string
) {
  const prototype = el instanceof HTMLTextAreaElement
    ? window.HTMLTextAreaElement.prototype
    : window.HTMLInputElement.prototype
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set
  if (!setter) {
    el.value = value
  } else {
    setter.call(el, value)
  }
}

function dispatchValueEvents(el: HTMLElement) {
  el.dispatchEvent(new Event("input", { bubbles: true }))
  el.dispatchEvent(new Event("change", { bubbles: true }))
}

function verifyTextValue(
  element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
  expectedValue: string
): boolean {
  return normalizeInlineText(element.value) === normalizeInlineText(expectedValue)
}

function clickAssociatedControl(input: HTMLInputElement) {
  const explicitLabel =
    input.id ? document.querySelector(`label[for="${CSS.escape(input.id)}"]`) : null
  const label = explicitLabel instanceof HTMLElement
    ? explicitLabel
    : input.closest("label")

  if (label instanceof HTMLElement) {
    label.click()
    return
  }

  input.click()
}

function resolveOptionNode(option: FormFieldOption): HTMLElement | null {
  if (!option.selector) return null
  try {
    const el = document.querySelector(option.selector)
    return el instanceof HTMLElement ? el : null
  } catch {
    return null
  }
}

function setCheckedState(el: HTMLInputElement, checked: boolean) {
  const setter = getCheckedSetter(el)
  if (!setter) {
    el.checked = checked
  } else {
    setter.call(el, checked)
  }
  dispatchValueEvents(el)
}

function optionMatches(option: FormFieldOption, needle: string): boolean {
  const normalizedNeedle = normalizeChoice(needle)
  if (!normalizedNeedle) return false

  const label = normalizeChoice(option.label || "")
  const value = normalizeChoice(option.value || "")

  return (
    label === normalizedNeedle ||
    value === normalizedNeedle ||
    label.includes(normalizedNeedle) ||
    normalizedNeedle.includes(label) ||
    value.includes(normalizedNeedle) ||
    normalizedNeedle.includes(value)
  )
}

function findMatchingOption(field: FormField, answer: string): FormFieldOption | null {
  const options = field.options || []
  if (!options.length) return null

  const selections = splitSelections(answer)
  const targets = selections.length ? selections : [answer]

  for (const target of targets) {
    const exact = options.find((option) => {
      const normalizedTarget = normalizeChoice(target)
      return (
        normalizeChoice(option.label || "") === normalizedTarget ||
        normalizeChoice(option.value || "") === normalizedTarget
      )
    })
    if (exact) return exact
  }

  for (const target of targets) {
    const fuzzy = options.find((option) => optionMatches(option, target))
    if (fuzzy) return fuzzy
  }

  return null
}

function resolveOptionElement(option: FormFieldOption): HTMLInputElement | null {
  if (!option.selector) return null
  try {
    const el = document.querySelector(option.selector)
    return el instanceof HTMLInputElement ? el : null
  } catch {
    return null
  }
}

function findInputOptionForField(
  field: FormField,
  option: FormFieldOption,
  expectedType: "radio" | "checkbox"
): HTMLInputElement | null {
  const direct = resolveOptionElement(option)
  if (direct && direct.type === expectedType) {
    return direct
  }

  const candidates = field.name
    ? Array.from(
        document.querySelectorAll<HTMLInputElement>(
          `input[type="${expectedType}"][name="${CSS.escape(field.name)}"]`
        )
      )
    : []

  for (const candidate of candidates) {
    const candidateLabel = findLabel(candidate) || candidate.value || ""
    const candidateOption = buildOption(candidateLabel, candidate.value, candidate)
    if (!candidateOption) continue

    if (optionMatches(candidateOption, option.label || option.value || "")) {
      return candidate
    }
  }

  return null
}

function verifyComboboxSelection(
  field: FormField,
  input: HTMLInputElement,
  option: FormFieldOption
): boolean {
  const visibleValue = normalizeInlineText(input.value)
  if (visibleValue && optionMatches({ label: visibleValue, value: visibleValue }, option.label || option.value || "")) {
    return true
  }

  if (field.name) {
    const backing = document.querySelector<HTMLInputElement>(`input[name="${CSS.escape(field.name)}"]`)
    const backingValue = normalizeInlineText(backing?.value || "")
    if (backingValue && optionMatches({ label: backingValue, value: backingValue }, option.label || option.value || "")) {
      return true
    }
  }

  return false
}

function interpretBooleanAnswer(answer: string): boolean | null {
  const normalized = normalizeChoice(answer)
  if (!normalized) return null

  if (["yes", "true", "authorized", "i am authorized", "available"].includes(normalized)) {
    return true
  }

  if (["no", "false", "not authorized", "unavailable"].includes(normalized)) {
    return false
  }

  return null
}

async function autofillField(field: FormField, answer: string): Promise<AutofillResultItem> {
  const trimmedAnswer = answer.trim()
  const resultBase = {
    field_id: field.field_id,
    label: field.label
  } satisfies Pick<AutofillResultItem, "field_id" | "label">

  if (!trimmedAnswer) {
    return { ...resultBase, status: "skipped", reason: "No answer to fill" }
  }

  const element = resolveFieldElement(field)
  if (!element) {
    return { ...resultBase, status: "failed", reason: "Field not found on page" }
  }

  try {
    if (field.type === "text") {
      if (!(element instanceof HTMLInputElement)) {
        return { ...resultBase, status: "failed", reason: "Target is not a text input" }
      }

      setNativeValue(element, trimmedAnswer)
      dispatchValueEvents(element)
      if (!verifyTextValue(element, trimmedAnswer)) {
        return { ...resultBase, status: "failed", reason: "Input value did not stick after autofill" }
      }
      return { ...resultBase, status: "filled" }
    }

    if (field.type === "textarea") {
      if (!(element instanceof HTMLTextAreaElement)) {
        return { ...resultBase, status: "failed", reason: "Target is not a textarea" }
      }
      setNativeValue(element, trimmedAnswer)
      dispatchValueEvents(element)
      if (!verifyTextValue(element, trimmedAnswer)) {
        return { ...resultBase, status: "failed", reason: "Textarea value did not stick after autofill" }
      }
      return { ...resultBase, status: "filled" }
    }

    if (field.type === "select") {
      if (!(element instanceof HTMLSelectElement)) {
        return { ...resultBase, status: "failed", reason: "Target is not a select" }
      }

      const option = findMatchingOption(field, trimmedAnswer)
      if (!option) {
        return { ...resultBase, status: "skipped", reason: "No matching select option" }
      }

      element.value = option.value || option.label
      dispatchValueEvents(element)
      if (!verifyTextValue(element, option.value || option.label)) {
        return { ...resultBase, status: "failed", reason: "Select value did not stick after autofill" }
      }
      return { ...resultBase, status: "filled" }
    }

    if (field.type === "combobox") {
      if (!(element instanceof HTMLInputElement)) {
        return { ...resultBase, status: "failed", reason: "Target is not a combobox input" }
      }

      const option = findMatchingOption(field, trimmedAnswer)
      if (!option) {
        return { ...resultBase, status: "skipped", reason: "No matching combobox option" }
      }

      element.focus()
      element.click()
      element.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }))

      for (const waitMs of [80, 180, 320]) {
        await delay(waitMs)
        const optionNode = resolveOptionNode(option)
        if (optionNode) {
          optionNode.click()
          await delay(80)
          if (verifyComboboxSelection(field, element, option)) {
            return { ...resultBase, status: "filled" }
          }
        }

        const liveOptions = getComboboxOptionNodes(element)
        const liveMatch = liveOptions.find((node) =>
          optionMatches(
            {
              label: normalizeInlineText(node.textContent || ""),
              value: node.getAttribute("data-value") || undefined
            },
            option.label || option.value || ""
          )
        )

        if (liveMatch) {
          liveMatch.click()
          await delay(80)
          if (verifyComboboxSelection(field, element, option)) {
            return { ...resultBase, status: "filled" }
          }
        }
      }

      element.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
      return { ...resultBase, status: "failed", reason: "Combobox option did not stick after autofill" }
    }

    if (field.type === "radio") {
      const option = findMatchingOption(field, trimmedAnswer)
      if (!option) {
        return { ...resultBase, status: "skipped", reason: "No matching radio option" }
      }

      const radio = findInputOptionForField(field, option, "radio")
      if (!radio) {
        return { ...resultBase, status: "failed", reason: "Radio option not found on page" }
      }

      clickAssociatedControl(radio)
      if (!radio.checked) {
        setCheckedState(radio, true)
      }
      if (!radio.checked) {
        return { ...resultBase, status: "failed", reason: "Radio option did not stay selected" }
      }
      return { ...resultBase, status: "filled" }
    }

    if (field.type === "checkbox") {
      const checkbox = element instanceof HTMLInputElement ? element : null
      const options = field.options || []

      if (options.length <= 1 && checkbox) {
        const boolAnswer = interpretBooleanAnswer(trimmedAnswer)
        if (boolAnswer === null) {
          return { ...resultBase, status: "skipped", reason: "Checkbox answer is not yes/no" }
        }
        if (checkbox.checked !== boolAnswer) {
          clickAssociatedControl(checkbox)
        }
        if (checkbox.checked !== boolAnswer) {
          setCheckedState(checkbox, boolAnswer)
        }
        if (checkbox.checked !== boolAnswer) {
          return { ...resultBase, status: "failed", reason: "Checkbox state did not stick after autofill" }
        }
        return { ...resultBase, status: "filled" }
      }

      const selections = splitSelections(trimmedAnswer)
      if (!selections.length) {
        return { ...resultBase, status: "skipped", reason: "No checkbox selections found" }
      }

      let filled = 0
      for (const selection of selections) {
        const option = findMatchingOption(field, selection)
        if (!option) continue
        const target = findInputOptionForField(field, option, "checkbox")
        if (!target) continue
        clickAssociatedControl(target)
        if (!target.checked) {
          setCheckedState(target, true)
        }
        if (!target.checked) {
          continue
        }
        filled += 1
      }

      if (!filled) {
        return { ...resultBase, status: "skipped", reason: "No matching checkbox options" }
      }

      return { ...resultBase, status: "filled", reason: filled < selections.length ? "Some selections could not be matched" : undefined }
    }

    return { ...resultBase, status: "skipped", reason: `Unsupported field type: ${field.type}` }
  } catch (error) {
    return {
      ...resultBase,
      status: "failed",
      reason: error instanceof Error ? error.message : "Unknown autofill error"
    }
  }
}

function base64ToUint8Array(base64Data: string): Uint8Array {
  const binary = atob(base64Data)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

function uploadResumeToFileField(
  field: FormField,
  resumeFile: AutofillResumeFilePayload | undefined
): AutofillResultItem {
  const resultBase = {
    field_id: field.field_id,
    label: field.label
  } satisfies Pick<AutofillResultItem, "field_id" | "label">

  if (!resumeFile) {
    return { ...resultBase, status: "skipped", reason: "No tailored resume file available" }
  }

  const element = resolveFieldElement(field)
  if (!(element instanceof HTMLInputElement) || element.type !== "file") {
    return { ...resultBase, status: "failed", reason: "Target is not a standard file input" }
  }

  try {
    const dataTransfer = new DataTransfer()
    const file = new File(
      [base64ToUint8Array(resumeFile.base64_data)],
      resumeFile.filename,
      { type: resumeFile.mime_type }
    )
    dataTransfer.items.add(file)
    element.files = dataTransfer.files
    dispatchValueEvents(element)
    return { ...resultBase, status: "filled" }
  } catch (error) {
    return {
      ...resultBase,
      status: "failed",
      reason: error instanceof Error ? error.message : "Could not attach resume file"
    }
  }
}

async function autofillForm(
  fields: FormField[],
  answers: AutofillAnswerInput[],
  resumeFile?: AutofillResumeFilePayload
): Promise<AutofillResultItem[]> {
  const answerMap = new Map(answers.map((answer) => [answer.field_id, answer]))
  const results: AutofillResultItem[] = []

  for (const field of fields) {
    if (field.type === "file") {
      results.push(uploadResumeToFileField(field, resumeFile))
      continue
    }

    const answer = answerMap.get(field.field_id)
    if (!answer) continue
    results.push(await autofillField(field, answer.answer))
  }

  return results
}

// ── Message Handler ──────────────────────────────────────────────────────
// Side panel sends messages, content script responds with extracted data.

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  void (async () => {
    if (msg.type === "EXTRACT_JD") {
      const result = extractJD()
      sendResponse({
        success: true,
        url: window.location.href,
        ...result
      })
      return
    }

    if (msg.type === "EXTRACT_FORM") {
      const fields = await extractFormFields()
      sendResponse({
        success: true,
        url: window.location.href,
        fields
      })
      return
    }

    if (msg.type === "AUTOFILL_FORM") {
      const fields = Array.isArray(msg.fields) ? msg.fields as FormField[] : []
      const answers = Array.isArray(msg.answers) ? msg.answers as AutofillAnswerInput[] : []
      const resumeFile =
        msg.resume_file && typeof msg.resume_file === "object"
          ? msg.resume_file as AutofillResumeFilePayload
          : undefined
      const results = await autofillForm(fields, answers, resumeFile)
      sendResponse({
        success: true,
        url: window.location.href,
        results
      })
      return
    }

    sendResponse({
      success: false,
      url: window.location.href,
      error: "Unsupported content-script message"
    })
  })().catch((error) => {
    sendResponse({
      success: false,
      url: window.location.href,
      error: error instanceof Error ? error.message : "Content script autofill failed"
    })
  })

  return true
})
