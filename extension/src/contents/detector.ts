import type { PlasmoCSConfig } from "plasmo"
import { Readability } from "@mozilla/readability"
import { debug, debugError } from "~lib/debug"
import type {
  AutofillAnswerInput,
  AutofillDiagnostics,
  AutofillFilePayload,
  AutofillResultItem,
  ExtractFormDiagnostics,
  FormField,
  FormFieldOption
} from "~lib/types"

export const config: PlasmoCSConfig = {
  matches: ["<all_urls>"],
  run_at: "document_idle"
}

// ── JD Extraction ────────────────────────────────────────────────────────

const JD_MAX_LENGTH = 15000
const MAIN_CONTENT_SELECTORS = [
  ".rad-job-detail__primary-content",
  "[id*='job-description'].rad-accordion-atom",
  ".rad-job-detail",
  "main",
  "article",
  "[role='main']",
  ".job-description",
  ".jd-description",
  "#job-description",
  ".posting-page",
  ".job-details",
  ".job-posting"
]
const BLOCK_TAGS = new Set(["ARTICLE", "ASIDE", "BLOCKQUOTE", "DD", "DIV", "DT", "H1", "H2", "H3", "H4", "H5", "H6", "LI", "OL", "P", "SECTION", "UL"])
const METADATA_LABEL_RE =
  /^(location|location type|employment type|job type|work type|workplace|department|team|compensation|salary|pay|schedule|commitment|experience level|seniority|timezone|time zone|work authorization|visa)$/i
const BOILERPLATE_RE =
  /^(apply now|sign in|sign up|share this job|save job|report job|back to jobs|cookie preferences|privacy policy|terms of service)$/i

function findFirstMatchingContainer(root: ParentNode, selectors: string[]): HTMLElement | null {
  for (const selector of selectors) {
    const match = root.querySelector(selector)
    if (match instanceof HTMLElement) return match
  }

  return null
}

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

function getPreferredJDContainer(root: ParentNode): HTMLElement | null {
  return findFirstMatchingContainer(root, MAIN_CONTENT_SELECTORS)
}

function getLinkedInJDContainer(root: ParentNode): HTMLElement | null {
  const selectors = [
    "#job-details",
    ".jobs-description__content #job-details",
    ".jobs-description__content",
    ".jobs-description",
    ".jobs-search__job-details--container .jobs-description"
  ]

  return findFirstMatchingContainer(root, selectors)
}

function getAccentureJDContainer(root: ParentNode): HTMLElement | null {
  const selectors = [
    ".rad-job-detail__primary-content",
    "[id*='job-description'].rad-accordion-atom",
    ".rad-job-detail"
  ]

  return findFirstMatchingContainer(root, selectors)
}

function extractJD(): { text: string; page_title?: string; company?: string; job_title?: string; metadata_lines?: string[]; readability_title?: string; readability_excerpt?: string; readability_siteName?: string; used_readability: boolean } {
  const body = document.body
  if (!body) return { text: "", used_readability: false }
  const hostname = window.location.hostname.toLowerCase()
  const pageHint = getPageHint()
  const isAccentureCareersPage =
    (hostname === "accenture.com" || hostname.endsWith(".accenture.com")) &&
    window.location.pathname.toLowerCase().includes("/careers/jobdetails")
  const isLinkedInJobsPage = pageHint === "linkedin"
  const accentureContainer = isAccentureCareersPage ? getAccentureJDContainer(body) : null

  if (isLinkedInJobsPage) {
    const linkedInContainer = getLinkedInJDContainer(body)
    if (linkedInContainer) {
      const linkedInStructured = collectStructuredContent(linkedInContainer)
      const linkedInText = buildJDText(
        linkedInStructured.metadataLines,
        linkedInContainer.innerText || "",
        linkedInStructured.bodyBlocks
      )

      debug("detector", "JD extraction candidate", {
        url: window.location.href,
        hostname,
        page_hint: pageHint,
        root: linkedInContainer.id ? `#${linkedInContainer.id}` : linkedInContainer.className || linkedInContainer.tagName,
        text_length: linkedInText.length
      })

      if (linkedInText.trim().length >= 120) {
        return {
          text: linkedInText,
          page_title: document.title || undefined,
          company: extractCompany(),
          job_title: extractJobTitle(),
          metadata_lines: linkedInStructured.metadataLines,
          used_readability: false
        }
      }
    }
  }

  if (accentureContainer) {
    const accentureStructured = collectStructuredContent(accentureContainer)
    const accentureText = buildJDText(
      accentureStructured.metadataLines,
      accentureContainer.innerText || "",
      accentureStructured.bodyBlocks
    )

    debug("detector", "JD extraction candidate", {
      url: window.location.href,
      hostname,
      page_hint: pageHint,
      root: accentureContainer.id ? `#${accentureContainer.id}` : accentureContainer.className || accentureContainer.tagName,
      text_length: accentureText.length
    })

    if (accentureText.trim().length >= 120) {
      return {
        text: accentureText,
        page_title: document.title || undefined,
        company: extractCompany(),
        job_title: extractJobTitle(),
        metadata_lines: accentureStructured.metadataLines,
        used_readability: false
      }
    }
  }

  // Try Mozilla Readability first
  const clone = document.cloneNode(true) as Document
  pruneForReadability(clone)
  const sourceRoot =
    (isLinkedInJobsPage ? getLinkedInJDContainer(clone.body) : null) ||
    (isAccentureCareersPage ? getAccentureJDContainer(clone.body) : null) ||
    getPreferredJDContainer(clone.body) ||
    clone.body
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
  const mainEl =
    (isLinkedInJobsPage ? getLinkedInJDContainer(body) : null) ||
    accentureContainer ||
    getPreferredJDContainer(body)

  const container = mainEl || body
  const fallbackStructured = collectStructuredContent(container)
  const trimmed = buildJDText(
    fallbackStructured.metadataLines,
    container.innerText || "",
    fallbackStructured.bodyBlocks
  )

  if (isAccentureCareersPage && trimmed.trim().length < 120 && accentureContainer) {
    const accentureStructured = collectStructuredContent(accentureContainer)
    const accentureText = buildJDText(
      accentureStructured.metadataLines,
      accentureContainer.innerText || "",
      accentureStructured.bodyBlocks
    )

    if (accentureText.trim()) {
      return {
        text: accentureText,
        page_title: document.title || undefined,
        company: extractCompany(),
        job_title: extractJobTitle(),
        metadata_lines: accentureStructured.metadataLines,
        used_readability: false
      }
    }
  }

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
    ".job-details-jobs-unified-top-card__company-name a",
    ".jobs-unified-top-card__company-name a",
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
    ".job-details-jobs-unified-top-card__job-title h1",
    ".jobs-unified-top-card__job-title h1",
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
const SECURITY_VERIFICATION_RE =
  /(just a moment|performing security verification|verify you are human|verify you are not a bot|checking your browser|cloudflare)/i

type ExtractionContext = {
  fields: FormField[]
  diagnostics: ExtractFormDiagnostics
}

type AutofillFieldOutcome = {
  result: AutofillResultItem
  strategy: string
}

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

function normalizeDedupeToken(value: string | undefined): string {
  return normalizeInlineText(value || "").toLowerCase()
}

function buildFieldDedupeKey(field: FormField): string {
  const normalizedLabel = normalizeDedupeToken(field.label)
  const normalizedType = normalizeDedupeToken(field.type)
  const normalizedInputType = normalizeDedupeToken(field.input_type)
  const normalizedName = normalizeDedupeToken(field.name)

  if (normalizedName) {
    return `${normalizedType}::${normalizedInputType}::${normalizedLabel}::name:${normalizedName}`
  }

  const normalizedFieldId = normalizeDedupeToken(field.field_id)
  if (normalizedFieldId && !normalizedFieldId.startsWith("field-")) {
    return `${normalizedType}::${normalizedInputType}::${normalizedLabel}::field:${normalizedFieldId}`
  }

  return `${normalizedType}::${normalizedInputType}::${normalizedLabel}`
}

function pickRicherField(existing: FormField, candidate: FormField): FormField {
  const existingScore =
    (existing.options?.length || 0) +
    (existing.required ? 2 : 0) +
    (existing.selector ? 1 : 0) +
    (existing.placeholder ? 1 : 0)
  const candidateScore =
    (candidate.options?.length || 0) +
    (candidate.required ? 2 : 0) +
    (candidate.selector ? 1 : 0) +
    (candidate.placeholder ? 1 : 0)

  return candidateScore > existingScore ? candidate : existing
}

function dedupeExtractedFields(fields: FormField[]): FormField[] {
  const seen = new Map<string, FormField>()

  for (const field of fields) {
    const key = buildFieldDedupeKey(field)
    const existing = seen.get(key)

    if (!existing) {
      seen.set(key, field)
      continue
    }

    seen.set(key, pickRicherField(existing, field))
  }

  return Array.from(seen.values())
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

function detectSecurityVerificationState(): string | null {
  const bodyText = normalizeInlineText(document.body?.innerText || "")
  const titleText = normalizeInlineText(document.title || "")
  const combined = `${titleText} ${bodyText}`.trim()

  if (!combined) return null
  if (!SECURITY_VERIFICATION_RE.test(combined)) return null

  return "This page is still behind security verification. Finish the check in the page, wait for the real form to load, then scan again."
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

function getListboxOptionNodes(trigger: HTMLElement): HTMLElement[] {
  const controlledIds = [
    trigger.getAttribute("aria-controls") || "",
    trigger.getAttribute("aria-owns") || ""
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

async function collectListboxOptions(trigger: HTMLElement): Promise<FormFieldOption[]> {
  trigger.focus()
  trigger.click()
  trigger.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }))

  for (const waitMs of [80, 180, 320]) {
    await delay(waitMs)
    const nodes = getListboxOptionNodes(trigger)
    const options = dedupeOptions(
      nodes.map((node) => buildOption(node.textContent || "", node.getAttribute("data-value"), node))
    )
      .filter((option) => option.label)
      .filter((option) => !/^(select an option|no options|loading)$/i.test(option.label))

    if (options.length > 0) {
      trigger.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
      return options
    }
  }

  trigger.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
  return []
}

async function collectComboboxOptions(el: HTMLInputElement): Promise<FormFieldOption[]> {
  return collectListboxOptions(el)
}

function getVisibleLinkedInEasyApplyModal(): HTMLElement | null {
  if (getPageHint() !== "linkedin") return null

  const selectors = [
    ".jobs-easy-apply-modal[role='dialog']",
    "[data-test-modal-id='easy-apply-modal'] .jobs-easy-apply-modal",
    "[data-test-modal-id='easy-apply-modal'] [role='dialog']",
    "#artdeco-modal-outlet .jobs-easy-apply-modal",
    "#artdeco-modal-outlet [role='dialog']"
  ]

  for (const selector of selectors) {
    const candidates = Array.from(document.querySelectorAll<HTMLElement>(selector))
      .filter((node) => isVisibleElement(node))
    if (candidates.length > 0) {
      return candidates[candidates.length - 1] || null
    }
  }

  return null
}

function getLinkedInEasyApplyStage(modalRoot: HTMLElement | null = getVisibleLinkedInEasyApplyModal()): string | undefined {
  if (!modalRoot) return undefined

  const selectors = [
    ".artdeco-modal__header h2",
    ".jobs-easy-apply-content__title",
    ".jobs-easy-apply-content__step-title",
    ".jobs-easy-apply-content__subtitle",
    "[data-test-easy-apply-modal-title]"
  ]

  for (const selector of selectors) {
    const text = normalizeInlineText((modalRoot.querySelector(selector) as HTMLElement | null)?.innerText || "")
    if (text && text.length <= 160) return text
  }

  return undefined
}

function findLinkedInFieldContainer(el: HTMLElement): HTMLElement | null {
  return (
    el.closest("[data-test-form-element]") ||
    el.closest(".jobs-easy-apply-form-section__grouping") ||
    el.closest(".jobs-easy-apply-form-section__question") ||
    el.closest(".fb-dash-form-element") ||
    el.closest(".artdeco-text-input")
  ) as HTMLElement | null
}

function isUsefulLinkedInLabelCandidate(text: string): boolean {
  if (!text) return false
  if (text.length < 2 || text.length > 220) return false
  if (/^(required|optional|select an option|choose an option|loading)$/i.test(text)) return false
  if (looksLikeOptionBlob(text) && text.length > 120) return false
  return true
}

function findLinkedInFieldLabel(el: HTMLElement): string {
  const container = findLinkedInFieldContainer(el)
  if (!container) return ""

  const selectors = [
    "label",
    "legend",
    ".fb-dash-form-element__label-title",
    ".fb-dash-form-element__label",
    ".jobs-easy-apply-form-section__grouping label",
    ".artdeco-text-input--label",
    "[data-test-form-element-label]"
  ]

  for (const selector of selectors) {
    const nodes = Array.from(container.querySelectorAll<HTMLElement>(selector))
    for (const node of nodes) {
      const text = cleanText(node)
      if (isUsefulLinkedInLabelCandidate(text)) return text
    }
  }

  for (const child of Array.from(container.children)) {
    const text = cleanText(child)
    if (isUsefulLinkedInLabelCandidate(text)) return text
  }

  return ""
}

function countMeaningfulFields(fields: FormField[]): number {
  return fields.filter((field) => {
    const label = normalizeInlineText(field.label || "")
    if (!label) return false
    if (/^(cari|search|select language)$/i.test(label)) return false
    if (label.length < 3) return false
    return true
  }).length
}

async function extractLinkedInSelectLikeFields(root: ParentNode, existingFields: FormField[]): Promise<FormField[]> {
  const triggers = Array.from(
    root.querySelectorAll<HTMLElement>("button[aria-haspopup='listbox'], button[role='combobox'], [role='combobox']")
  ).filter((node) => isVisibleElement(node))

  const existingKeys = new Set(
    existingFields.map((field) => `${field.selector || ""}::${field.field_id || ""}::${field.label || ""}`)
  )
  const extracted: FormField[] = []

  for (const trigger of triggers) {
    const rawLabel = findLabel(trigger)
    if (!rawLabel) continue

    const selector = buildElementSelector(trigger)
    const fieldId =
      trigger.id ||
      trigger.getAttribute("aria-controls") ||
      trigger.getAttribute("data-test-form-element-id") ||
      `linkedin-trigger-${extracted.length}`
    const dedupeKey = `${selector}::${fieldId}::${normalizeInlineText(rawLabel)}`
    if (existingKeys.has(dedupeKey)) continue

    const sanitized = sanitizeFieldLabel(trigger, fieldId, "combobox", rawLabel)
    if (!sanitized.label) continue

    const field: FormField = {
      field_id: fieldId,
      label: sanitized.label,
      name: trigger.getAttribute("name") || "",
      type: "combobox",
      required:
        trigger.getAttribute("aria-required") === "true" ||
        /required/i.test(trigger.getAttribute("aria-label") || "") ||
        /required/i.test(findLinkedInFieldContainer(trigger)?.innerText || ""),
      selector,
      input_type: undefined
    }

    if (sanitized.aiSkipReason) {
      field.ai_skip_reason = sanitized.aiSkipReason
      field.ai_skip_kind = sanitized.aiSkipKind
    }

    field.options = await collectListboxOptions(trigger)
    if (!field.options.length) {
      field.ai_skip_reason = "LinkedIn dropdown options could not be extracted; complete manually"
      field.ai_skip_kind = "unsupported-combobox"
    } else if ((field.options.length || 0) > AI_OPTION_SKIP_THRESHOLD && !field.ai_skip_reason) {
      field.ai_skip_reason = `Too many options (${field.options.length}) for one AI pass`
      field.ai_skip_kind = "oversized-options"
    }

    extracted.push(field)
    existingKeys.add(dedupeKey)
  }

  return extracted
}

async function extractFormFieldsFromRoot(root: ParentNode): Promise<FormField[]> {
  const fields: FormField[] = []
  const seen = new Set<string>()
  const seenRadioNames = new Set<string>()

  const inputs = root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
    "input, textarea, select"
  )

  for (const el of inputs) {
    if (el instanceof HTMLInputElement && SKIP_TYPES.has(el.type)) continue
    if (el.getAttribute("aria-hidden") === "true") continue
    if (el.hasAttribute("disabled")) continue
    if (
      el instanceof HTMLTextAreaElement &&
      el.hasAttribute("readonly") &&
      el.tabIndex === -1
    ) {
      continue
    }
    if (!el.offsetParent && el.getClientRects().length === 0 && el.type !== "hidden" && el.type !== "file") continue

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
      if (el.type === "radio") {
        const groupQuestion = findGroupLabel(el)
        if (groupQuestion) {
          field.label = groupQuestion
        }
        const radios = root.querySelectorAll<HTMLInputElement>(`input[name="${CSS.escape(el.name)}"]`)
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
            const groupQuestion = findGroupLabel(el)
            if (groupQuestion) {
              field.label = groupQuestion
            }
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

  if (getPageHint() === "linkedin") {
    fields.push(...await extractLinkedInSelectLikeFields(root, fields))
  }

  return dedupeExtractedFields(fields)
}

function buildFieldTypeCounts(fields: FormField[]): Record<string, number> {
  return fields.reduce<Record<string, number>>((acc, field) => {
    acc[field.type] = (acc[field.type] || 0) + 1
    return acc
  }, {})
}

function buildExtractFormDiagnostics(
  fields: FormField[],
  extractionRoot: ExtractFormDiagnostics["extraction_root"],
  modalDetected: boolean,
  modalRetryUsed: boolean
): ExtractFormDiagnostics {
  const modalRoot = modalDetected ? getVisibleLinkedInEasyApplyModal() : null
  return {
    hostname: window.location.hostname,
    title: document.title || "",
    page_hint: getPageHint(),
    page_stage: getLinkedInEasyApplyStage(modalRoot),
    extraction_root: extractionRoot,
    modal_detected: modalDetected,
    modal_retry_used: modalRetryUsed || undefined,
    field_count: fields.length,
    meaningful_field_count: countMeaningfulFields(fields),
    field_types: buildFieldTypeCounts(fields)
  }
}

async function extractFormFields(): Promise<ExtractionContext> {
  const pageHint = getPageHint()

  if (pageHint !== "linkedin") {
    const fields = await extractFormFieldsFromRoot(document)
    return {
      fields,
      diagnostics: buildExtractFormDiagnostics(fields, "document", false, false)
    }
  }

  const modalRoot = getVisibleLinkedInEasyApplyModal()
  if (!modalRoot) {
    debug("detector", "LinkedIn extraction falling back to full document because no Easy Apply modal was visible", {
      url: window.location.href,
      hostname: window.location.hostname
    })
    const fields = await extractFormFieldsFromRoot(document)
    return {
      fields,
      diagnostics: buildExtractFormDiagnostics(fields, "document", false, false)
    }
  }

  let modalFields = await extractFormFieldsFromRoot(modalRoot)
  let meaningfulFieldCount = countMeaningfulFields(modalFields)
  let modalRetryUsed = false

  if (meaningfulFieldCount < 2) {
    modalRetryUsed = true
    debug("detector", "LinkedIn Easy Apply modal detected but yielded too few meaningful fields on first pass; retrying", {
      url: window.location.href,
      hostname: window.location.hostname,
      modal_field_count: modalFields.length,
      meaningful_field_count: meaningfulFieldCount
    })
    await delay(180)
    const retriedModalRoot = getVisibleLinkedInEasyApplyModal() || modalRoot
    modalFields = await extractFormFieldsFromRoot(retriedModalRoot)
    meaningfulFieldCount = countMeaningfulFields(modalFields)
  }

  if (meaningfulFieldCount >= 2) {
    debug("detector", "LinkedIn Easy Apply modal-first extraction succeeded", {
      url: window.location.href,
      hostname: window.location.hostname,
      modal_field_count: modalFields.length,
      meaningful_field_count: meaningfulFieldCount
    })
    return {
      fields: modalFields,
      diagnostics: buildExtractFormDiagnostics(modalFields, "linkedin-easy-apply-modal", true, modalRetryUsed)
    }
  }

  debug("detector", "LinkedIn Easy Apply modal-first extraction did not find enough meaningful fields; falling back to full document", {
    url: window.location.href,
    hostname: window.location.hostname,
    modal_field_count: modalFields.length,
    meaningful_field_count: meaningfulFieldCount
  })
  const fields = await extractFormFieldsFromRoot(document)
  return {
    fields,
    diagnostics: buildExtractFormDiagnostics(fields, "document", true, modalRetryUsed)
  }
}

/** Get clean text from an element, stripping SVGs and form controls */
function cleanText(el: Element): string {
  const clone = el.cloneNode(true) as HTMLElement
  clone.querySelectorAll("svg, img, input, textarea, select").forEach(c => c.remove())
  return normalizeInlineText(clone.textContent || "")
}

function getCandidateLabelText(el: Element | null): string {
  if (!el) return ""
  if (
    el instanceof HTMLElement &&
    el.tagName !== "LABEL" &&
    el.tagName !== "LEGEND" &&
    el.querySelector("button, [role='button'], [role='tab'], [role='option']")
  ) {
    return ""
  }
  const text = cleanText(el)
  if (!text) return ""
  if (text.length > 320) return ""
  if (/^(rp|idr|usd|sgd|eur|gbp|jpy|aud|cad|\*)$/i.test(text)) return ""
  if (!/[A-Za-z]/.test(text) && !/[^\u0000-\u007f]/.test(text)) return ""
  return text
}

function scoreLabelCandidate(text: string): number {
  const normalized = normalizeInlineText(text)
  if (!normalized) return -1
  if (/^(required|optional|select|search|choose|loading)$/i.test(normalized)) return -1
  if (/^(rp|idr|usd|sgd|eur|gbp|jpy|aud|cad|\*)$/i.test(normalized)) return -1
  if (looksLikeOptionBlob(normalized)) return -1

  let score = 0
  const wordCount = normalized.split(/\s+/).filter(Boolean).length

  if (wordCount >= 2) score += 2
  if (normalized.length >= 12) score += 2
  if (normalized.endsWith("?")) score += 3
  if (normalized.includes("*")) score += 1
  if (wordCount === 1 && normalized.length <= 5) score -= 2
  if (normalized.length > 220) score -= 2

  return score
}

function findNearbyContainerLabel(el: HTMLElement): string {
  let container = el.parentElement
  let bestLabel = ""
  let bestScore = 0

  for (let depth = 0; depth < 10 && container; depth += 1) {
    const prev = container.previousElementSibling
    if (prev && ["LABEL", "SPAN", "P", "DIV"].includes(prev.tagName)) {
      const text = getCandidateLabelText(prev)
      const score = scoreLabelCandidate(text)
      if (score > bestScore) {
        bestLabel = text
        bestScore = score
      }
    }

    for (const child of Array.from(container.children)) {
      if (child.contains(el)) break
      if (["LABEL", "SPAN", "P", "DIV"].includes(child.tagName)) {
        const text = getCandidateLabelText(child)
        const score = scoreLabelCandidate(text)
        if (score > bestScore) {
          bestLabel = text
          bestScore = score
        }
      }
    }

    if (bestScore >= 5) return bestLabel
    container = container.parentElement
  }

  return bestLabel
}

function findLabel(el: HTMLElement): string {
  const linkedInLabel = getPageHint() === "linkedin" ? findLinkedInFieldLabel(el) : ""
  if (linkedInLabel) return linkedInLabel

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
  if (prev && (prev.tagName === "LABEL" || prev.tagName === "SPAN" || prev.tagName === "P" || prev.tagName === "DIV")) {
    const text = cleanText(prev)
    if (text) return text
  }
  const nearbyContainerLabel = findNearbyContainerLabel(el)
  if (nearbyContainerLabel) return nearbyContainerLabel
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

async function commitTextLikeValue(
  element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
  expectedValue: string,
  pageHint?: string
): Promise<boolean> {
  if ("focus" in element) {
    element.focus()
  }

  dispatchValueEvents(element)

  if (verifyTextValue(element, expectedValue)) {
    return true
  }

  if (pageHint === "jobstreet") {
    element.dispatchEvent(new Event("blur", { bubbles: true }))
    element.dispatchEvent(new Event("focusout", { bubbles: true }))
    await delay(90)
    return verifyTextValue(element, expectedValue)
  }

  return false
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
  trigger: HTMLElement,
  option: FormFieldOption
): boolean {
  if (trigger instanceof HTMLInputElement) {
    const visibleValue = normalizeInlineText(trigger.value)
    if (visibleValue && optionMatches({ label: visibleValue, value: visibleValue }, option.label || option.value || "")) {
      return true
    }
  } else {
    const triggerText = normalizeInlineText(trigger.innerText || trigger.textContent || "")
    const triggerLabel = normalizeInlineText(trigger.getAttribute("aria-label") || "")
    if (
      (triggerText && optionMatches({ label: triggerText, value: triggerText }, option.label || option.value || "")) ||
      (triggerLabel && optionMatches({ label: triggerLabel, value: triggerLabel }, option.label || option.value || ""))
    ) {
      return true
    }
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

async function autofillField(field: FormField, answer: string): Promise<AutofillFieldOutcome> {
  const trimmedAnswer = answer.trim()
  const resultBase = {
    field_id: field.field_id,
    label: field.label
  } satisfies Pick<AutofillResultItem, "field_id" | "label">
  const pageHint = getPageHint()

  if (!trimmedAnswer) {
    return { result: { ...resultBase, status: "skipped", reason: "No answer to fill" }, strategy: "no-answer" }
  }

  const element = resolveFieldElement(field)
  if (!element) {
    return { result: { ...resultBase, status: "failed", reason: "Field not found on page" }, strategy: "element-missing" }
  }

  try {
    if (field.type === "text") {
      if (!(element instanceof HTMLInputElement)) {
        return { result: { ...resultBase, status: "failed", reason: "Target is not a text input" }, strategy: "text-input-mismatch" }
      }

      setNativeValue(element, trimmedAnswer)
      if (!(await commitTextLikeValue(element, trimmedAnswer, pageHint))) {
        return {
          result: {
            ...resultBase,
            status: "failed",
            reason:
              pageHint === "jobstreet"
                ? "JobStreet controlled input rejected scripted value"
                : pageHint === "linkedin"
                  ? "LinkedIn controlled input rejected scripted value"
                  : "Input value did not stick after autofill"
          },
          strategy: "text-native-set"
        }
      }
      return { result: { ...resultBase, status: "filled" }, strategy: "text-native-set" }
    }

    if (field.type === "textarea") {
      if (!(element instanceof HTMLTextAreaElement)) {
        return { result: { ...resultBase, status: "failed", reason: "Target is not a textarea" }, strategy: "textarea-mismatch" }
      }
      setNativeValue(element, trimmedAnswer)
      if (!(await commitTextLikeValue(element, trimmedAnswer, pageHint))) {
        return {
          result: {
            ...resultBase,
            status: "failed",
            reason:
              pageHint === "jobstreet"
                ? "JobStreet controlled textarea rejected scripted value"
                : pageHint === "linkedin"
                  ? "LinkedIn controlled textarea rejected scripted value"
                  : "Textarea value did not stick after autofill"
          },
          strategy: "textarea-native-set"
        }
      }
      return { result: { ...resultBase, status: "filled" }, strategy: "textarea-native-set" }
    }

    if (field.type === "select") {
      if (!(element instanceof HTMLSelectElement)) {
        return { result: { ...resultBase, status: "failed", reason: "Target is not a select" }, strategy: "select-mismatch" }
      }

      const option = findMatchingOption(field, trimmedAnswer)
      if (!option) {
        return { result: { ...resultBase, status: "skipped", reason: "No matching select option" }, strategy: "select-no-match" }
      }

      element.value = option.value || option.label
      if (!(await commitTextLikeValue(element, option.value || option.label, pageHint))) {
        return {
          result: {
            ...resultBase,
            status: "failed",
            reason:
              pageHint === "jobstreet"
                ? "JobStreet select rejected scripted value"
                : pageHint === "linkedin"
                  ? "LinkedIn select rejected scripted value"
                  : "Select value did not stick after autofill"
          },
          strategy: "native-select"
        }
      }
      return { result: { ...resultBase, status: "filled" }, strategy: "native-select" }
    }

    if (field.type === "combobox") {
      const option = findMatchingOption(field, trimmedAnswer)
      if (!option) {
        return { result: { ...resultBase, status: "skipped", reason: "No matching combobox option" }, strategy: "combobox-no-match" }
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
            return { result: { ...resultBase, status: "filled" }, strategy: "combobox-selector-click" }
          }
        }

        const liveOptions = getListboxOptionNodes(element)
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
            return { result: { ...resultBase, status: "filled" }, strategy: "combobox-live-match" }
          }
        }
      }

      element.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
      return {
        result: {
          ...resultBase,
          status: "failed",
          reason:
            pageHint === "linkedin"
              ? "LinkedIn dropdown selection did not stick after autofill"
              : "Combobox option did not stick after autofill"
        },
        strategy: "combobox-selection-failed"
      }
    }

    if (field.type === "radio") {
      const option = findMatchingOption(field, trimmedAnswer)
      if (!option) {
        return { result: { ...resultBase, status: "skipped", reason: "No matching radio option" }, strategy: "radio-no-match" }
      }

      const radio = findInputOptionForField(field, option, "radio")
      if (!radio) {
        return { result: { ...resultBase, status: "failed", reason: "Radio option not found on page" }, strategy: "radio-missing" }
      }

      clickAssociatedControl(radio)
      if (!radio.checked) {
        setCheckedState(radio, true)
      }
      if (!radio.checked) {
        return { result: { ...resultBase, status: "failed", reason: "Radio option did not stay selected" }, strategy: "radio-select" }
      }
      return { result: { ...resultBase, status: "filled" }, strategy: "radio-select" }
    }

    if (field.type === "checkbox") {
      const checkbox = element instanceof HTMLInputElement ? element : null
      const options = field.options || []

      if (options.length <= 1 && checkbox) {
        const boolAnswer = interpretBooleanAnswer(trimmedAnswer)
        if (boolAnswer === null) {
          return { result: { ...resultBase, status: "skipped", reason: "Checkbox answer is not yes/no" }, strategy: "checkbox-bool-invalid" }
        }
        if (checkbox.checked !== boolAnswer) {
          clickAssociatedControl(checkbox)
        }
        if (checkbox.checked !== boolAnswer) {
          setCheckedState(checkbox, boolAnswer)
        }
        if (checkbox.checked !== boolAnswer) {
          return { result: { ...resultBase, status: "failed", reason: "Checkbox state did not stick after autofill" }, strategy: "checkbox-bool" }
        }
        return { result: { ...resultBase, status: "filled" }, strategy: "checkbox-bool" }
      }

      const selections = splitSelections(trimmedAnswer)
      if (!selections.length) {
        return { result: { ...resultBase, status: "skipped", reason: "No checkbox selections found" }, strategy: "checkbox-group-empty" }
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
        return { result: { ...resultBase, status: "skipped", reason: "No matching checkbox options" }, strategy: "checkbox-group-no-match" }
      }

      return {
        result: { ...resultBase, status: "filled", reason: filled < selections.length ? "Some selections could not be matched" : undefined },
        strategy: "checkbox-group"
      }
    }

    return {
      result: { ...resultBase, status: "skipped", reason: `Unsupported field type: ${field.type}` },
      strategy: "unsupported-field-type"
    }
  } catch (error) {
    return {
      result: {
        ...resultBase,
        status: "failed",
        reason: error instanceof Error ? error.message : "Unknown autofill error"
      },
      strategy: "exception"
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
  filePayload: AutofillFilePayload | undefined
): AutofillFieldOutcome {
  const resultBase = {
    field_id: field.field_id,
    label: field.label
  } satisfies Pick<AutofillResultItem, "field_id" | "label">

  if (!filePayload) {
    return { result: { ...resultBase, status: "skipped", reason: "No file selected for upload" }, strategy: "file-no-payload" }
  }

  const element = resolveFieldElement(field)
  if (!(element instanceof HTMLInputElement) || element.type !== "file") {
    return { result: { ...resultBase, status: "failed", reason: "Target is not a standard file input" }, strategy: "file-input-missing" }
  }

  try {
    const dataTransfer = new DataTransfer()
    const file = new File(
      [base64ToUint8Array(filePayload.base64_data)],
      filePayload.filename,
      { type: filePayload.mime_type }
    )
    dataTransfer.items.add(file)
    element.files = dataTransfer.files
    dispatchValueEvents(element)
    return { result: { ...resultBase, status: "filled" }, strategy: "file-input-upload" }
  } catch (error) {
    return {
      result: {
        ...resultBase,
        status: "failed",
        reason: error instanceof Error ? error.message : "Could not attach resume file"
      },
      strategy: "file-upload-exception"
    }
  }
}

async function autofillForm(
  fields: FormField[],
  answers: AutofillAnswerInput[]
): Promise<{ results: AutofillResultItem[]; strategyCounts: Record<string, number> }> {
  const answerMap = new Map(answers.map((answer) => [answer.field_id, answer]))
  const results: AutofillResultItem[] = []
  const strategyCounts: Record<string, number> = {}

  for (const field of fields) {
    let outcome: AutofillFieldOutcome | null = null
    if (field.type === "file") {
      const answer = answerMap.get(field.field_id)
      outcome = uploadResumeToFileField(field, answer?.file_upload || undefined)
    } else {
      const answer = answerMap.get(field.field_id)
      if (!answer) continue
      outcome = await autofillField(field, answer.answer)
    }

    if (!outcome) continue
    results.push(outcome.result)
    strategyCounts[outcome.strategy] = (strategyCounts[outcome.strategy] || 0) + 1
    debug("detector", "AUTOFILL_FIELD result", {
      field_id: field.field_id,
      label: field.label,
      field_type: field.type,
      strategy: outcome.strategy,
      status: outcome.result.status,
      reason: outcome.result.reason
    })
  }

  return { results, strategyCounts }
}

function getPageHint(): string | undefined {
  const hostname = window.location.hostname.toLowerCase()
  if (hostname.includes("linkedin")) return "linkedin"
  if (hostname.includes("jobstreet")) return "jobstreet"
  if (hostname.includes("greenhouse")) return "greenhouse"
  if (hostname.includes("lever")) return "lever"
  if (hostname.includes("ashby")) return "ashby"
  if (hostname.includes("workday")) return "workday"
  return undefined
}

function buildAutofillDiagnostics(
  fields: FormField[],
  results: AutofillResultItem[],
  strategyCounts: Record<string, number>
): AutofillDiagnostics {
  const filled = results.filter((item) => item.status === "filled").length
  const skipped = results.filter((item) => item.status === "skipped").length
  const failed = results.filter((item) => item.status === "failed").length
  const failureReasons = Array.from(
    new Set(
      results
        .filter((item) => item.status === "failed" && item.reason)
        .map((item) => item.reason as string)
    )
  ).slice(0, 8)

  const modalRoot = getVisibleLinkedInEasyApplyModal()

  return {
    hostname: window.location.hostname,
    title: document.title || "",
    page_hint: getPageHint(),
    page_stage: getLinkedInEasyApplyStage(modalRoot),
    extraction_root: modalRoot ? "linkedin-easy-apply-modal" : "document",
    modal_detected: Boolean(modalRoot),
    attempted_fields: results.length,
    file_fields: fields.filter((field) => field.type === "file").length,
    filled,
    skipped,
    failed,
    failure_reasons: failureReasons,
    strategy_counts: strategyCounts
  }
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
      debug("detector", "EXTRACT_FORM requested", {
        url: window.location.href,
        hostname: window.location.hostname,
        title: document.title || ""
      })
      const securityVerificationError = detectSecurityVerificationState()
      if (securityVerificationError) {
        debugError("detector", "EXTRACT_FORM blocked by verification state", securityVerificationError)
        sendResponse({
          success: false,
          url: window.location.href,
          fields: [],
          error: securityVerificationError
        })
        return
      }

      const extraction = await extractFormFields()
      debug("detector", "EXTRACT_FORM completed", {
        url: window.location.href,
        hostname: window.location.hostname,
        diagnostics: extraction.diagnostics,
        extracted_fields_preview: extraction.fields.slice(0, 12).map((field) => ({
          label: field.label,
          type: field.type,
          required: field.required,
          option_count: field.options?.length || 0,
          selector: field.selector
        }))
      })
      sendResponse({
        success: true,
        url: window.location.href,
        fields: extraction.fields,
        diagnostics: extraction.diagnostics
      })
      return
    }

    if (msg.type === "AUTOFILL_FORM") {
      const fields = Array.isArray(msg.fields) ? msg.fields as FormField[] : []
      const answers = Array.isArray(msg.answers) ? msg.answers as AutofillAnswerInput[] : []
      debug("detector", "AUTOFILL_FORM requested", {
        url: window.location.href,
        hostname: window.location.hostname,
        title: document.title || "",
        page_hint: getPageHint(),
        field_count: fields.length,
        answer_count: answers.length,
        file_field_count: fields.filter((field) => field.type === "file").length
      })
      const { results, strategyCounts } = await autofillForm(fields, answers)
      const diagnostics = buildAutofillDiagnostics(fields, results, strategyCounts)
      debug("detector", "AUTOFILL_FORM completed", diagnostics)
      sendResponse({
        success: true,
        url: window.location.href,
        results,
        diagnostics
      })
      return
    }

    sendResponse({
      success: false,
      url: window.location.href,
      error: "Unsupported content-script message"
    })
  })().catch((error) => {
    debugError("detector", "Content script request failed", {
      url: window.location.href,
      hostname: window.location.hostname,
      title: document.title || "",
      page_hint: getPageHint(),
      error: error instanceof Error ? error.message : "Content script autofill failed"
    })
    sendResponse({
      success: false,
      url: window.location.href,
      error: error instanceof Error ? error.message : "Content script autofill failed"
    })
  })

  return true
})
