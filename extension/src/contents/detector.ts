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

function extractJD(): { text: string; company?: string; job_title?: string; readability_title?: string; readability_excerpt?: string; readability_siteName?: string; used_readability: boolean } {
  const body = document.body
  if (!body) return { text: "", used_readability: false }

  // Try Mozilla Readability first
  const clone = document.cloneNode(true) as Document
  const article = new Readability(clone).parse()

  if (article?.textContent && article.textContent.trim().length > 100) {
    const text = article.textContent.trim()
    const trimmed = text.length > 15000 ? text.slice(0, 15000) : text

    return {
      text: trimmed,
      company: extractCompany() || article.siteName || undefined,
      job_title: extractJobTitle() || article.title || undefined,
      readability_title: article.title || undefined,
      readability_excerpt: article.excerpt || undefined,
      readability_siteName: article.siteName || undefined,
      used_readability: true
    }
  }

  // Fallback: manual selector-based extraction
  const mainEl = body.querySelector(
    "main, article, [role='main'], .job-description, .jd-description, " +
    "#job-description, .posting-page, .job-details, .job-posting"
  ) as HTMLElement | null

  const container = mainEl || body
  const text = container.innerText || ""
  const trimmed = text.length > 15000 ? text.slice(0, 15000) : text

  return {
    text: trimmed,
    company: extractCompany(),
    job_title: extractJobTitle(),
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
    return (el as HTMLInputElement).placeholder
  }
  return ""
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
