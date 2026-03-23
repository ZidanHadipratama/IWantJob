import { useCallback, useEffect, useRef, useState } from "react"

import { createApiClient, type QAPairItem } from "~lib/api"
import { debug, debugError } from "~lib/debug"
import { sendToContentScript } from "~lib/messaging"
import {
  getStorage,
  normalizeActiveJobContext,
  normalizeFillFormSession,
  setStorage,
  type ActiveJobContext,
  type FillFormStepState,
  type InFlightRequest
} from "~lib/storage"
import type {
  AutofillAnswerInput,
  AutofillDiagnostics,
  AutofillFilePayload,
  AutofillFileSource,
  AutofillFormResponse,
  AutofillResultItem,
  ExtractFormResponse,
  FormField,
  ResumeJson
} from "~lib/types"

export interface AnswerCard extends AutofillAnswerInput {
  copied: boolean
}

export type FillFormPhase = "idle" | "extracted" | "answered"
export type GenerationMode = "single" | "batch"

export const MAX_AI_FIELDS_PER_BATCH = 25
export const MAX_SINGLE_PASS_FIELD_PAYLOAD = 4500
export const MAX_BATCH_FIELD_PAYLOAD = 2800
export const MAX_SOFT_FLAGGED_OVERRIDES = 2

export function isSoftOverrideField(field: FormField): boolean {
  return field.ai_skip_kind === "oversized-options"
}

export function getEffectiveAiSkipReason(field: FormField, includedFlaggedFieldIds: string[]): string | null {
  if (!field.ai_skip_reason) return null
  if (isSoftOverrideField(field) && includedFlaggedFieldIds.includes(field.field_id)) {
    return null
  }
  return field.ai_skip_reason
}

function estimateFieldPayloadLength(field: FormField): number {
  const optionsText = (field.options || []).map((option) => `${option.label || ""} ${option.value || ""}`).join(" ")
  return field.label.length + (field.placeholder?.length || 0) + optionsText.length + 80
}

function estimateFieldSetPayloadLength(fields: FormField[]): number {
  return fields.reduce((total, field) => total + estimateFieldPayloadLength(field), 0)
}

function buildFieldBatches(fields: FormField[], maxFields: number, maxPayload: number): FormField[][] {
  const batches: FormField[][] = []
  let current: FormField[] = []
  let currentPayload = 0

  for (const field of fields) {
    const nextPayload = estimateFieldPayloadLength(field)
    const shouldStartNewBatch =
      current.length > 0 && (current.length >= maxFields || currentPayload + nextPayload > maxPayload)

    if (shouldStartNewBatch) {
      batches.push(current)
      current = []
      currentPayload = 0
    }

    current.push(field)
    currentPayload += nextPayload
  }

  if (current.length > 0) batches.push(current)
  return batches
}

function sanitizeFilenamePart(value: string, fallback: string): string {
  const normalized = value.replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "")
  return normalized || fallback
}

function buildPdfFilename(context: ActiveJobContext | null): string {
  const companyPart = sanitizeFilenamePart(context?.company || "company", "company")
  const namePart = sanitizeFilenamePart(context?.tailored_resume_json?.contact?.name || "resume", "resume")

  return `CV_${companyPart}_${namePart}.pdf`
}

function buildCoverLetterFilename(context: ActiveJobContext | null): string {
  const segments = [context?.company || "company", context?.job_title || "cover_letter"]
    .map((segment) => segment.replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, ""))
    .filter(Boolean)

  return `${segments.join("_") || "cover_letter"}.txt`
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ""
  const chunkSize = 0x8000

  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize)
    binary += String.fromCharCode(...chunk)
  }

  return btoa(binary)
}

async function fileToPayload(file: File): Promise<AutofillFilePayload> {
  return {
    filename: file.name,
    mime_type: file.type || "application/octet-stream",
    base64_data: arrayBufferToBase64(await file.arrayBuffer())
  }
}

function textToPayload(text: string, filename: string): AutofillFilePayload {
  const encoded = new TextEncoder().encode(text)
  return {
    filename,
    mime_type: "text/plain;charset=utf-8",
    base64_data: arrayBufferToBase64(encoded.buffer.slice(encoded.byteOffset, encoded.byteOffset + encoded.byteLength))
  }
}

export function getAutofillSummary(results: AutofillResultItem[]) {
  const filled = results.filter((item) => item.status === "filled").length
  const skipped = results.filter((item) => item.status === "skipped").length
  const failed = results.filter((item) => item.status === "failed").length

  let toneClass = "border-emerald-100 bg-emerald-50 text-emerald-800"
  let message = "Autofill completed successfully for every attempted field."

  if (failed > 0 && filled === 0) {
    toneClass = "border-red-100 bg-red-50 text-red-700"
    message = "Autofill could not complete the attempted fields. Manual input is still required."
  } else if (failed > 0 || skipped > 0) {
    toneClass = "border-amber-100 bg-amber-50 text-amber-800"
    message = "Autofill only completed part of the form. Review the skipped or failed fields before submitting."
  }

  const hasFileIssue = results.some(
    (item) => item.status !== "filled" && /resume|upload|file/i.test(`${item.label} ${item.reason || ""}`)
  )

  return { filled, skipped, failed, toneClass, message, hasFileIssue }
}

function describeDiagnostics(diagnostics?: AutofillDiagnostics): string {
  if (!diagnostics) return ""

  const site = diagnostics.page_stage || diagnostics.page_hint || diagnostics.hostname || "this page"
  const reasons = diagnostics.failure_reasons.length
    ? ` Top failures: ${diagnostics.failure_reasons.join(" | ")}.`
    : ""
  const rootHint = diagnostics.extraction_root ? ` Root: ${diagnostics.extraction_root}.` : ""
  const strategyHint = diagnostics.strategy_counts
    ? ` Strategies: ${Object.entries(diagnostics.strategy_counts).map(([key, count]) => `${key}=${count}`).join(", ")}.`
    : ""

  return `${site} summary: ${diagnostics.filled} filled, ${diagnostics.skipped} skipped, ${diagnostics.failed} failed out of ${diagnostics.attempted_fields} attempted.${rootHint}${strategyHint}${reasons}`
}

type StepSyncMode = "reset-session" | "replace-current-step" | "append-step"

function normalizeIdentityPart(value?: string): string {
  return (value || "").replace(/\s+/g, " ").trim().toLowerCase()
}

function hashString(value: string): string {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }

  return (hash >>> 0).toString(36)
}

function buildPageKey(url: string, fields: FormField[], frameId: number | null): string {
  const normalizedUrl = url.replace(/#.*$/, "")
  const signature = fields
    .map((field) => {
      const options = (field.options || [])
        .map((option) => `${option.label || ""}:${option.value || ""}`)
        .join("|")

      return [
        field.type,
        field.field_id,
        field.name,
        field.label,
        field.input_type || "",
        field.placeholder || "",
        field.required ? "required" : "optional",
        options
      ].join("::")
    })
    .join("|")
    .replace(/\s+/g, " ")
    .trim()
  const signatureHash = hashString(signature)

  return `${normalizedUrl}::${frameId ?? "main"}::${fields.length}::${signatureHash || "empty"}`
}

function buildAnswerIdentity(answer: Pick<AutofillAnswerInput, "field_id" | "label" | "field_type">): string {
  const normalizedFieldId = normalizeIdentityPart(answer.field_id)
  if (normalizedFieldId) {
    return `id:${normalizedFieldId}`
  }

  return `label:${normalizeIdentityPart(answer.field_type)}:${normalizeIdentityPart(answer.label)}`
}

function buildFieldIdentityCandidates(field: FormField): string[] {
  const candidates = new Set<string>()
  const normalizedFieldId = normalizeIdentityPart(field.field_id)
  const normalizedSelector = normalizeIdentityPart(field.selector)
  const normalizedName = normalizeIdentityPart(field.name)
  const normalizedLabel = normalizeIdentityPart(field.label)
  const normalizedType = normalizeIdentityPart(field.type)

  if (normalizedFieldId) candidates.add(`id:${normalizedFieldId}`)
  if (normalizedSelector) candidates.add(`selector:${normalizedSelector}`)
  if (normalizedName) candidates.add(`name:${normalizedType}:${normalizedName}`)
  if (normalizedLabel) candidates.add(`label:${normalizedType}:${normalizedLabel}`)
  if (normalizedName || normalizedLabel) {
    candidates.add(`combo:${normalizedType}:${normalizedName}:${normalizedLabel}`)
  }

  return [...candidates]
}

function buildAnswerIdentityCandidates(answer: Pick<AutofillAnswerInput, "field_id" | "label" | "field_type">): string[] {
  const candidates = new Set<string>()
  const normalizedFieldId = normalizeIdentityPart(answer.field_id)
  const normalizedLabel = normalizeIdentityPart(answer.label)
  const normalizedType = normalizeIdentityPart(answer.field_type)

  if (normalizedFieldId) candidates.add(`id:${normalizedFieldId}`)
  if (normalizedLabel) candidates.add(`label:${normalizedType}:${normalizedLabel}`)

  return [...candidates]
}

function buildAvailableAnswersMap(answers: AutofillAnswerInput[]): Map<string, AutofillAnswerInput> {
  const availableAnswers = new Map<string, AutofillAnswerInput>()
  for (const answer of answers) {
    for (const candidate of buildAnswerIdentityCandidates(answer)) {
      if (!availableAnswers.has(candidate)) {
        availableAnswers.set(candidate, answer)
      }
    }
  }

  return availableAnswers
}

function buildAnswerCard(
  field: FormField,
  matchedAnswer?: AutofillAnswerInput | null,
  includedFlaggedFieldIds: string[] = []
): AnswerCard {
  const defaultAiSelected = !getEffectiveAiSkipReason(field, includedFlaggedFieldIds)

  return {
    field_id: field.field_id,
    label: field.label,
    answer: matchedAnswer?.answer || "",
    field_type: field.type,
    ai_selected: matchedAnswer?.ai_selected ?? defaultAiSelected,
    removed: matchedAnswer?.removed ?? false,
    file_upload_source: matchedAnswer?.file_upload_source,
    file_upload: matchedAnswer?.file_upload ?? null,
    copied: false
  }
}

function buildDraftAnswerCards(
  sourceFields: FormField[],
  sourceAnswers: AutofillAnswerInput[],
  includedFlaggedFieldIds: string[] = []
): AnswerCard[] {
  const availableAnswers = buildAvailableAnswersMap(sourceAnswers)
  return sourceFields.map((field) => buildAnswerCard(field, getMatchedAnswer(field, availableAnswers), includedFlaggedFieldIds))
}

function mergeGeneratedAnswersIntoDraftCards(
  sourceFields: FormField[],
  existingAnswers: AutofillAnswerInput[],
  generatedAnswers: AutofillAnswerInput[],
  includedFlaggedFieldIds: string[] = []
): AnswerCard[] {
  const draftCards = buildDraftAnswerCards(sourceFields, existingAnswers, includedFlaggedFieldIds)
  const generatedAnswerMap = buildAvailableAnswersMap(generatedAnswers)

  return draftCards.map((card) => {
    const field = sourceFields.find((item) => item.field_id === card.field_id)
    if (!field) return card

    const generated = getMatchedAnswer(field, generatedAnswerMap)
    if (!generated) return card

    return {
      ...card,
      answer: generated.answer,
      field_type: generated.field_type || card.field_type,
      copied: false
    }
  })
}

function isAnswerRemoved(answer: Pick<AutofillAnswerInput, "removed">): boolean {
  return answer.removed === true
}

function hasAnswerValue(answer: Pick<AutofillAnswerInput, "answer" | "file_upload_source" | "file_upload">): boolean {
  return answer.answer.trim().length > 0 || Boolean(answer.file_upload_source || answer.file_upload)
}

function isPersistableAnswer(answer: AutofillAnswerInput): boolean {
  return !isAnswerRemoved(answer) && hasAnswerValue(answer)
}

function getPersistedStepAnswers(step: FillFormStepState): AutofillAnswerInput[] {
  return getStepContextAnswers(step).filter(isPersistableAnswer)
}

function flattenPersistedAnswers(steps: FillFormStepState[]): AutofillAnswerInput[] {
  return [...steps]
    .sort((left, right) => left.pageIndex - right.pageIndex)
    .flatMap((step) => getPersistedStepAnswers(step))
}

function getSelectedAiFields(
  stepFields: FormField[],
  stepAnswers: AutofillAnswerInput[],
  includedFlaggedFieldIds: string[]
): FormField[] {
  const availableAnswers = buildAvailableAnswersMap(stepAnswers)
  return stepFields.filter((field) => {
    if (getEffectiveAiSkipReason(field, includedFlaggedFieldIds)) return false
    const matched = getMatchedAnswer(field, availableAnswers)
    return Boolean(matched) && !isAnswerRemoved(matched) && matched.ai_selected !== false
  })
}

function countSelectedAiFields(
  stepFields: FormField[],
  stepAnswers: AutofillAnswerInput[],
  includedFlaggedFieldIds: string[]
): number {
  return getSelectedAiFields(stepFields, stepAnswers, includedFlaggedFieldIds).length
}

function countVisibleAnsweredQuestions(stepAnswers: AutofillAnswerInput[]): number {
  return stepAnswers.filter((answer) => !isAnswerRemoved(answer) && hasAnswerValue(answer)).length
}

function buildStepState(
  pageIndex: number,
  pageKey: string,
  pageUrl: string,
  fields: FormField[],
  answers: AnswerCard[],
  retainedAnswers: AutofillAnswerInput[],
  fieldCount: number,
  frameId: number | null,
  includedFlaggedFieldIds: string[]
): FillFormStepState {
  return {
    pageIndex,
    pageKey,
    pageUrl,
    fields,
    answers: answers.map(({ copied, ...answer }) => answer),
    retainedAnswers,
    fieldCount,
    frameId,
    includedFlaggedFieldIds
  }
}

function dedupeAnswers(answers: AutofillAnswerInput[]): AutofillAnswerInput[] {
  const deduped = new Map<string, AutofillAnswerInput>()
  for (const answer of answers) {
    deduped.set(buildAnswerIdentity(answer), answer)
  }

  return [...deduped.values()]
}

function getStepContextAnswers(step: FillFormStepState): AutofillAnswerInput[] {
  return dedupeAnswers([...(step.retainedAnswers || []), ...step.answers])
}

function flattenStepAnswers(steps: FillFormStepState[]): AutofillAnswerInput[] {
  return [...steps]
    .sort((left, right) => left.pageIndex - right.pageIndex)
    .flatMap((step) => getStepContextAnswers(step))
}

function buildPriorAnswerContext(
  steps: FillFormStepState[],
  currentPageKey: string,
  currentPageIndex: number
): Array<{ field_id?: string; question: string; answer: string; field_type?: string }> {
  return [...steps]
    .filter((step) => !(step.pageKey === currentPageKey && step.pageIndex === currentPageIndex))
    .sort((left, right) => left.pageIndex - right.pageIndex)
    .flatMap((step) => getStepContextAnswers(step))
    .filter(isPersistableAnswer)
    .filter((answer) => answer.field_type !== "file")
    .map((answer) => ({
      field_id: answer.field_id,
      question: answer.label,
      answer: answer.answer,
      field_type: answer.field_type
    }))
}

function getMatchedAnswer(
  field: FormField,
  availableAnswers: Map<string, AutofillAnswerInput>
): AutofillAnswerInput | null {
  const candidates = buildFieldIdentityCandidates(field)
  for (const candidate of candidates) {
    const matched = availableAnswers.get(candidate)
    if (matched) return matched
  }

  return null
}

function preserveFlaggedFieldSelections(
  previousFields: FormField[],
  previousSelectedFieldIds: string[],
  nextFields: FormField[]
): string[] {
  if (previousSelectedFieldIds.length === 0) return []

  const selectedCandidates = new Set<string>()
  for (const field of previousFields) {
    if (previousSelectedFieldIds.includes(field.field_id)) {
      buildFieldIdentityCandidates(field).forEach((candidate) => selectedCandidates.add(candidate))
    }
  }

  return nextFields
    .filter((field) => isSoftOverrideField(field))
    .filter((field) => buildFieldIdentityCandidates(field).some((candidate) => selectedCandidates.has(candidate)))
    .map((field) => field.field_id)
}

function mergeExtractedStepState(
  existingStep: FillFormStepState | null,
  nextFields: FormField[]
): {
  mergedAnswers: AnswerCard[]
  retainedAnswers: AutofillAnswerInput[]
  retainedFlaggedFieldIds: string[]
} {
  if (!existingStep) {
    return {
      mergedAnswers: [],
      retainedAnswers: [],
      retainedFlaggedFieldIds: []
    }
  }

  const contextAnswers = getStepContextAnswers(existingStep)
  if (contextAnswers.length === 0) {
    return {
      mergedAnswers: [],
      retainedAnswers: [],
      retainedFlaggedFieldIds: preserveFlaggedFieldSelections(
        existingStep.fields,
        existingStep.includedFlaggedFieldIds || [],
        nextFields
      )
    }
  }

  const availableAnswers = buildAvailableAnswersMap(contextAnswers)

  const usedAnswerKeys = new Set<string>()
  const mergedAnswers = nextFields.map((field) => {
    const matched = getMatchedAnswer(field, availableAnswers)
    if (matched) {
      usedAnswerKeys.add(buildAnswerIdentity(matched))
    }
    return buildAnswerCard(field, matched, existingStep.includedFlaggedFieldIds || [])
  })

  const retainedAnswers = contextAnswers.filter((answer) => {
    if (!isPersistableAnswer(answer)) return false
    return !usedAnswerKeys.has(buildAnswerIdentity(answer))
  })

  return {
    mergedAnswers,
    retainedAnswers,
    retainedFlaggedFieldIds: preserveFlaggedFieldSelections(
      existingStep.fields,
      existingStep.includedFlaggedFieldIds || [],
      nextFields
    )
  }
}

export interface FillFormController {
  phase: FillFormPhase
  loading: boolean
  error: string
  personaText: string
  fields: FormField[]
  answers: AnswerCard[]
  autofillResults: AutofillResultItem[]
  autofillLoading: boolean
  fieldCount: number
  frameId: number | null
  activeJobContext: ActiveJobContext | null
  savingDraft: boolean
  saveTone: "neutral" | "success" | "error"
  saveMessage: string
  includedFlaggedFieldIds: string[]
  isUnlocked: boolean
  recoveredWithoutResumeContext: boolean
  hasPersona: boolean
  hasSavedJobWithLocalDraft: boolean
  aiEligibleFields: FormField[]
  softOverrideFields: Array<FormField & { effective_skip_reason: string | null; is_included: boolean }>
  skippedFields: Array<FormField & { effective_skip_reason: string | null }>
  fileFieldCount: number
  selectedSoftOverrideCount: number
  answerableFieldCount: number
  selectedAiFieldCount: number
  allScannedSelectedAiFieldCount: number
  needsBatchGeneration: boolean
  autofillSummary: ReturnType<typeof getAutofillSummary>
  currentPageIndex: number
  totalScannedSteps: number
  accumulatedAnswerCount: number
  shouldPromptRescanCurrentPage: boolean
  priorAnswerCount: number
  priorAnswerPreview: Array<{
    pageIndex: number
    question: string
    answer: string
  }>
  stepSummaries: Array<{
    pageIndex: number
    fieldCount: number
    answeredCount: number
    isCurrent: boolean
  }>
  handleSelectStep: (pageIndex: number) => Promise<void>
  handleExtractForm: () => Promise<void>
  handleRescanCurrentPage: () => Promise<void>
  handlePrepareNextStep: () => Promise<void>
  handleFillForm: (mode?: GenerationMode) => Promise<void>
  handleFillAllScannedSteps: () => Promise<void>
  handleStartManualAnswers: () => Promise<void>
  handleCopy: (idx: number) => Promise<void>
  handleCopyAll: () => Promise<void>
  handleAnswerChange: (idx: number, value: string) => void
  handleToggleAiSelection: (idx: number, checked: boolean) => void
  handleRemoveQuestion: (idx: number) => Promise<void>
  handleRestoreQuestion: (fieldId: string) => Promise<void>
  handleUseGeneratedFile: (idx: number, source: Extract<AutofillFileSource, "tailored-resume" | "cover-letter">) => Promise<void>
  handleUploadLocalFile: (idx: number, file: File | null) => Promise<void>
  handleClearFileSelection: (idx: number) => Promise<void>
  handleToggleFlaggedField: (fieldId: string) => void
  handleSaveDraft: () => Promise<void>
  handleAutofillForm: () => Promise<void>
  handleReset: () => void
}

export function useFillFormController(): FillFormController {
  const [phase, setPhase] = useState<FillFormPhase>("idle")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [personaText, setPersonaText] = useState("")
  const [fields, setFields] = useState<FormField[]>([])
  const [answers, setAnswers] = useState<AnswerCard[]>([])
  const [autofillResults, setAutofillResults] = useState<AutofillResultItem[]>([])
  const [autofillLoading, setAutofillLoading] = useState(false)
  const [fieldCount, setFieldCount] = useState(0)
  const [frameId, setFrameId] = useState<number | null>(null)
  const [pageIndex, setPageIndex] = useState(1)
  const [pageKey, setPageKey] = useState("")
  const [pageUrl, setPageUrl] = useState("")
  const [steps, setSteps] = useState<FillFormStepState[]>([])
  const [allQaPairs, setAllQaPairs] = useState<AutofillAnswerInput[]>([])
  const [shouldPromptRescanCurrentPage, setShouldPromptRescanCurrentPage] = useState(false)
  const [activeJobContext, setActiveJobContext] = useState<ActiveJobContext | null>(null)
  const [savingDraft, setSavingDraft] = useState(false)
  const [saveTone, setSaveTone] = useState<"neutral" | "success" | "error">("neutral")
  const [saveMessage, setSaveMessage] = useState("")
  const [includedFlaggedFieldIds, setIncludedFlaggedFieldIds] = useState<string[]>([])
  const extractionLockRef = useRef(false)

  const persistCurrentStepSelection = useCallback(async (targetStep: FillFormStepState, nextSteps: FillFormStepState[] = steps) => {
    const nextPhase: FillFormPhase = targetStep.answers.length > 0 ? "answered" : "extracted"
    const nextAllQaPairs = flattenPersistedAnswers(nextSteps)

    setPhase(nextPhase)
    setFields(targetStep.fields)
    setAnswers(targetStep.answers.map((answer) => ({ ...answer, copied: false })))
    setFieldCount(targetStep.fieldCount)
    setFrameId(targetStep.frameId ?? null)
    setPageIndex(targetStep.pageIndex)
    setPageKey(targetStep.pageKey)
    setPageUrl(targetStep.pageUrl || "")
    setSteps(nextSteps)
    setAllQaPairs(nextAllQaPairs)
    setIncludedFlaggedFieldIds(targetStep.includedFlaggedFieldIds || [])
    setAutofillResults([])
    setShouldPromptRescanCurrentPage(false)

    await setStorage("fillform_session", {
      phase: nextPhase,
      fields: targetStep.fields,
      answers: targetStep.answers,
      fieldCount: targetStep.fieldCount,
      frameId: targetStep.frameId ?? null,
      pageIndex: targetStep.pageIndex,
      pageKey: targetStep.pageKey,
      pageUrl: targetStep.pageUrl || "",
      steps: nextSteps,
      allQaPairs: nextAllQaPairs,
      includedFlaggedFieldIds: targetStep.includedFlaggedFieldIds || [],
      inFlightRequest: null
    })

    const context = normalizeActiveJobContext(await getStorage("active_job_context"))
    if (!context) return

    await setStorage("active_job_context", {
      ...context,
      persistence_state: "draft",
      draft_qa_pairs: nextAllQaPairs.map(({ field_id, label, answer, field_type }) => ({
        field_id,
        label,
        answer,
        field_type
      }))
    })
  }, [steps])

  const clearFillFormState = useCallback(() => {
    setPhase("idle")
    setFields([])
    setAnswers([])
    setFieldCount(0)
    setFrameId(null)
    setPageIndex(1)
    setPageKey("")
    setPageUrl("")
    setSteps([])
    setAllQaPairs([])
    setShouldPromptRescanCurrentPage(false)
    setIncludedFlaggedFieldIds([])
    setLoading(false)
  }, [])

  const applyFillFormSession = useCallback((session: ReturnType<typeof normalizeFillFormSession>) => {
    if (!session) {
      clearFillFormState()
      return
    }

    setPhase(session.phase as FillFormPhase)
    setFields(session.fields as FormField[])
    setAnswers(session.answers.map((answer) => ({ ...answer, copied: false })))
    setFieldCount(session.fieldCount)
    setFrameId(session.frameId ?? null)
    setPageIndex(session.pageIndex || 1)
    setPageKey(session.pageKey || "")
    setPageUrl(session.pageUrl || "")
    setSteps(session.steps || [])
    setAllQaPairs(session.allQaPairs || [])
    setShouldPromptRescanCurrentPage(false)
    setIncludedFlaggedFieldIds(session.includedFlaggedFieldIds || [])
    setLoading(session.inFlightRequest?.kind === "generate_answers")
  }, [clearFillFormState])

  const findCurrentStepIndex = useCallback((candidateSteps: FillFormStepState[]) => {
    const byPageKey = candidateSteps.findIndex((step) => step.pageKey === pageKey)
    if (byPageKey >= 0) return byPageKey

    return candidateSteps.findIndex((step) => step.pageIndex === pageIndex)
  }, [pageIndex, pageKey])

  const isUnlocked = Boolean(
    activeJobContext?.phase === "tailored" &&
      activeJobContext?.tailored_resume_json &&
      activeJobContext?.job_description?.trim()
  )

  useEffect(() => {
    debug("FillForm", "Component mounted")
    Promise.all([
      getStorage("fillform_session"),
      getStorage("active_job_context"),
      getStorage("persona_text")
    ]).then(([sessionRaw, contextRaw, personaRaw]) => {
      const session = normalizeFillFormSession(sessionRaw)
      const context = normalizeActiveJobContext(contextRaw)
      setPersonaText(typeof personaRaw === "string" ? personaRaw.trim() : "")
      if (context) setActiveJobContext(context)

      if (session && session.phase !== "idle") {
        applyFillFormSession(session)
        setAutofillResults([])
        debug("FillForm", "Restored session, phase:", session.phase)
      }
    })
  }, [applyFillFormSession])

  const syncDraftState = useCallback(
    async (
      nextPhase: FillFormPhase,
      nextFields: FormField[],
      nextAnswers: AnswerCard[],
      nextFieldCount: number,
      nextFrameId: number | null = frameId,
      nextPageIndex: number = pageIndex,
      nextPageKey: string = pageKey || `step-${pageIndex}`,
      nextPageUrl: string = pageUrl,
      nextIncludedFlaggedFieldIds: string[] = includedFlaggedFieldIds,
      nextRetainedAnswers?: AutofillAnswerInput[],
      inFlightRequest: InFlightRequest | null = null,
      stepMode: StepSyncMode = "replace-current-step"
    ) => {
      const normalizedIncludedFlaggedFieldIds = nextIncludedFlaggedFieldIds.filter((fieldId) =>
        nextFields.some((field) => field.field_id === fieldId && isSoftOverrideField(field))
      )
      const currentStepIndex = findCurrentStepIndex(steps)
      const retainedAnswers =
        nextRetainedAnswers ||
        (currentStepIndex >= 0 ? steps[currentStepIndex].retainedAnswers || [] : [])

      const nextStep = buildStepState(
        nextPageIndex,
        nextPageKey,
        nextPageUrl,
        nextFields,
        nextAnswers,
        retainedAnswers,
        nextFieldCount,
        nextFrameId,
        normalizedIncludedFlaggedFieldIds
      )

      let nextSteps: FillFormStepState[]
      if (stepMode === "reset-session") {
        nextSteps = [nextStep]
      } else if (stepMode === "append-step") {
        nextSteps = [...steps.filter((step) => step.pageKey !== nextPageKey), nextStep].sort(
          (left, right) => left.pageIndex - right.pageIndex
        )
      } else {
        const currentKey = pageKey || nextPageKey
        const existingIndex = steps.findIndex((step) => step.pageKey === currentKey)
        if (existingIndex >= 0) {
          nextSteps = steps.map((step, index) => (index === existingIndex ? nextStep : step))
        } else if (steps.some((step) => step.pageKey === nextPageKey)) {
          nextSteps = steps.map((step) => (step.pageKey === nextPageKey ? nextStep : step))
        } else {
          nextSteps = [...steps, nextStep].sort((left, right) => left.pageIndex - right.pageIndex)
        }
      }

      const nextAllQaPairs = flattenPersistedAnswers(nextSteps)

      setPageIndex(nextPageIndex)
      setPageKey(nextPageKey)
      setPageUrl(nextPageUrl)
      setSteps(nextSteps)
      setAllQaPairs(nextAllQaPairs)

      await setStorage("fillform_session", {
        phase: nextPhase,
        fields: nextFields,
        answers: nextAnswers.map(({ copied, ...answer }) => answer),
        fieldCount: nextFieldCount,
        frameId: nextFrameId,
        pageIndex: nextPageIndex,
        pageKey: nextPageKey,
        pageUrl: nextPageUrl,
        steps: nextSteps,
        allQaPairs: nextAllQaPairs,
        includedFlaggedFieldIds: normalizedIncludedFlaggedFieldIds,
        inFlightRequest
      })

      const context = normalizeActiveJobContext(await getStorage("active_job_context"))
      if (!context) return

      await setStorage("active_job_context", {
        ...context,
        persistence_state: "draft",
        draft_qa_pairs: nextAllQaPairs.map(({ field_id, label, answer, field_type }) => ({
          field_id,
          label,
          answer,
          field_type
        }))
      })
    },
    [findCurrentStepIndex, frameId, includedFlaggedFieldIds, pageIndex, pageKey, pageUrl, steps]
  )

  useEffect(() => {
    let mounted = true

    getStorage("active_job_context").then((context) => {
      if (mounted) setActiveJobContext(normalizeActiveJobContext(context))
    })

    function handleStorageChange(changes: Record<string, chrome.storage.StorageChange>, areaName: string) {
      if (areaName !== "local") return
      if (changes.active_job_context) {
        setActiveJobContext(normalizeActiveJobContext(changes.active_job_context.newValue))
      }
      if (changes.persona_text) {
        setPersonaText(typeof changes.persona_text.newValue === "string" ? changes.persona_text.newValue.trim() : "")
      }
      if (changes.fillform_session) {
        const nextSession = normalizeFillFormSession(changes.fillform_session.newValue)
        if (nextSession) {
          applyFillFormSession(nextSession)
        } else {
          clearFillFormState()
        }
      }
    }

    chrome.storage.onChanged.addListener(handleStorageChange)
    return () => {
      mounted = false
      chrome.storage.onChanged.removeListener(handleStorageChange)
    }
  }, [applyFillFormSession, clearFillFormState])

  const extractFormIntoSession = useCallback(async (stepMode: StepSyncMode) => {
    if (extractionLockRef.current) {
      debug("FillForm", "Ignoring duplicate extraction while another scan is in flight", { stepMode })
      return
    }

    extractionLockRef.current = true
    setLoading(true)
    setError("")
    try {
      debug("FillForm", "Sending EXTRACT_FORM to content script...")
      const result: ExtractFormResponse = await sendToContentScript("EXTRACT_FORM")
      debug("FillForm", "EXTRACT_FORM response:", result)
      if (!result.success) {
        debugError("FillForm", "EXTRACT_FORM rejected by page", {
          url: result.url,
          error: result.error || "unknown extraction failure"
        })
        setError(result.error || "The page rejected form extraction. Try refreshing the page and scanning again.")
        return
      }
      if (result.fields.length === 0) {
        setError("No form fields found on this page or in accessible embedded frames. Make sure you're on an application form page.")
        return
      }
      if (result.diagnostics) {
        debug("FillForm", "EXTRACT_FORM diagnostics:", result.diagnostics)
      }
      debug("FillForm", `Found ${result.fields.length} fields:`, result.fields.map((field) => field.label))
      const fieldsWithOptions = result.fields.filter((field) => field.options?.length)
      if (fieldsWithOptions.length) {
        debug(
          "FillForm",
          `Fields with options (${fieldsWithOptions.length}):`,
          fieldsWithOptions.map((field) => ({ label: field.label, type: field.type, options: field.options }))
        )
      }
      const nextFrameId = typeof result.frame_id === "number" ? result.frame_id : null
      const nextPageUrl = result.url || ""
      const nextPageKey = buildPageKey(nextPageUrl, result.fields, nextFrameId)
      const matchingStepIndex = steps.findIndex((step) => step.pageKey === nextPageKey)
      const currentStepIndex = findCurrentStepIndex(steps)
      const targetStepIndex =
        stepMode === "reset-session"
          ? -1
          : matchingStepIndex >= 0
            ? matchingStepIndex
            : stepMode === "replace-current-step"
              ? currentStepIndex
              : -1
      const existingStep = targetStepIndex >= 0 ? steps[targetStepIndex] : null
      const nextPageIndex =
        existingStep?.pageIndex ??
        (stepMode === "append-step"
          ? steps.reduce((maxValue, step) => Math.max(maxValue, step.pageIndex), 0) + 1
          : stepMode === "reset-session"
            ? 1
            : pageIndex)
      const {
        mergedAnswers,
        retainedAnswers,
        retainedFlaggedFieldIds
      } = mergeExtractedStepState(existingStep, result.fields)
      const nextAnswers =
        mergedAnswers.length > 0
          ? mergedAnswers
          : buildDraftAnswerCards(result.fields, [], retainedFlaggedFieldIds)
      const nextPhase: FillFormPhase = "answered"

      setFields(result.fields)
      setAnswers(nextAnswers)
      setFieldCount(result.fields.length)
      setFrameId(nextFrameId)
      setIncludedFlaggedFieldIds(retainedFlaggedFieldIds)
      setAutofillResults([])
      setShouldPromptRescanCurrentPage(false)
      setPhase(nextPhase)
      await syncDraftState(
        nextPhase,
        result.fields,
        nextAnswers,
        result.fields.length,
        nextFrameId,
        nextPageIndex,
        nextPageKey,
        nextPageUrl,
        retainedFlaggedFieldIds,
        retainedAnswers,
        null,
        stepMode
      )
    } catch (err) {
      debugError("FillForm", "EXTRACT_FORM failed:", err)
      setError(err instanceof Error ? err.message : "Could not connect to the page. Try refreshing the page.")
    } finally {
      extractionLockRef.current = false
      setLoading(false)
    }
  }, [findCurrentStepIndex, pageIndex, steps, syncDraftState])

  const handleExtractForm = useCallback(async () => {
    await extractFormIntoSession("reset-session")
  }, [extractFormIntoSession])

  const handleRescanCurrentPage = useCallback(async () => {
    await extractFormIntoSession("replace-current-step")
  }, [extractFormIntoSession])

  const handlePrepareNextStep = useCallback(async () => {
    await extractFormIntoSession("append-step")
  }, [extractFormIntoSession])

  const handleSelectStep = useCallback(async (targetPageIndex: number) => {
    setError("")

    const targetStep = [...steps]
      .sort((left, right) => left.pageIndex - right.pageIndex)
      .find((step) => step.pageIndex === targetPageIndex)

    if (!targetStep) return
    await persistCurrentStepSelection(targetStep)
  }, [persistCurrentStepSelection, steps])

  const getGenerationContext = useCallback(async () => {
    if (!isUnlocked) {
      throw new Error("Tailor a resume first in the Resume tab to unlock Fill Form for this job.")
    }

    const [baseResumeJson, nextActiveJobContext] = await Promise.all([
      getStorage("base_resume_json"),
      getStorage("active_job_context")
    ])
    const personaTextRaw = await getStorage("persona_text")
    const nextPersonaText = typeof personaTextRaw === "string" ? personaTextRaw.trim() : ""
    const resumeJson: ResumeJson | null = nextActiveJobContext?.tailored_resume_json || baseResumeJson
    if (!resumeJson) {
      throw new Error("No resume found. Go to Settings and add your base resume first.")
    }

    return {
      client: await createApiClient(),
      nextActiveJobContext,
      nextPersonaText,
      resumeJson
    }
  }, [isUnlocked])

  const handleFillForm = useCallback(
    async (mode: GenerationMode = "single") => {
      const requestId = crypto.randomUUID()
      setLoading(true)
      setError("")
      let shouldClearLoading = false
      try {
        const { client, nextActiveJobContext, nextPersonaText, resumeJson } = await getGenerationContext()
        const priorAnswers = buildPriorAnswerContext(steps, pageKey || `step-${pageIndex}`, pageIndex)
        const selectedAiFields = getSelectedAiFields(fields, answers, includedFlaggedFieldIds)
        if (selectedAiFields.length === 0) {
          setError("No active questions are selected for AI on this step.")
          shouldClearLoading = true
          return
        }

        const needsBatchGeneration =
          selectedAiFields.length > MAX_AI_FIELDS_PER_BATCH ||
          estimateFieldSetPayloadLength(selectedAiFields) > MAX_SINGLE_PASS_FIELD_PAYLOAD

        if (needsBatchGeneration && mode === "single") {
          setError("The selected AI questions are too large for one pass. Use batch mode for this step.")
          shouldClearLoading = true
          return
        }

        await syncDraftState(
          "answered",
          fields,
          answers,
          fieldCount,
          frameId,
          pageIndex,
          pageKey || `step-${pageIndex}`,
          pageUrl,
          includedFlaggedFieldIds,
          undefined,
          {
            id: requestId,
            kind: "generate_answers"
          },
          "replace-current-step"
        )
        const batches =
          mode === "batch"
            ? buildFieldBatches(selectedAiFields, MAX_AI_FIELDS_PER_BATCH, MAX_BATCH_FIELD_PAYLOAD)
            : [selectedAiFields]

        debug("FillForm", "Calling fill-form with", selectedAiFields.length, "selected AI fields in", batches.length, "batch(es)")

        const collectedAnswers: AnswerCard[] = []
        for (const batch of batches) {
          const latestSessionBeforeBatch = normalizeFillFormSession(await getStorage("fillform_session"))
          if (latestSessionBeforeBatch?.inFlightRequest?.id !== requestId) {
            debug("FillForm", "Aborting batch generation due to stale request", requestId)
            return
          }

          const result = await client.fillForm({
            form_fields: batch,
            resume_json: resumeJson,
            persona_text: nextPersonaText || undefined,
            job_description: nextActiveJobContext?.job_description || undefined,
            structured_job_description: nextActiveJobContext?.structured_job_description || undefined,
            prior_answers: priorAnswers
          })
          debug("FillForm", "fill-form response:", result)

          collectedAnswers.push(
            ...result.answers.map((answer) => ({
              field_id: answer.field_id || "",
              label: answer.label || "",
              answer: answer.answer || "",
              field_type: answer.field_type || "text",
              copied: false
            }))
          )
        }

        const cards = mergeGeneratedAnswersIntoDraftCards(fields, answers, collectedAnswers, includedFlaggedFieldIds)
        const latestSession = normalizeFillFormSession(await getStorage("fillform_session"))
        if (latestSession?.inFlightRequest?.id !== requestId) {
          debug("FillForm", "Ignoring stale fill-form response for request", requestId)
          return
        }
        setAnswers(cards)
        setAutofillResults([])
        setShouldPromptRescanCurrentPage(false)
        setPhase("answered")
        await syncDraftState(
          "answered",
          fields,
          cards,
          fieldCount,
          frameId,
          pageIndex,
          pageKey || `step-${pageIndex}`,
          pageUrl,
          includedFlaggedFieldIds,
          undefined,
          null,
          "replace-current-step"
        )
        shouldClearLoading = true
      } catch (err) {
        debugError("FillForm", "fill-form failed:", err)
        const latestSession = normalizeFillFormSession(await getStorage("fillform_session"))
        if (latestSession?.inFlightRequest?.id === requestId) {
          await syncDraftState(
            "answered",
            fields,
            answers,
            fieldCount,
            frameId,
            pageIndex,
            pageKey || `step-${pageIndex}`,
            pageUrl,
            includedFlaggedFieldIds,
            undefined,
            null,
            "replace-current-step"
          )
          shouldClearLoading = true
        }
        setError(err instanceof Error ? err.message : "Failed to generate answers")
      } finally {
        if (shouldClearLoading) {
          setLoading(false)
        }
      }
    },
    [answers, fieldCount, fields, frameId, getGenerationContext, includedFlaggedFieldIds, pageIndex, pageKey, pageUrl, steps, syncDraftState]
  )

  const handleFillAllScannedSteps = useCallback(async () => {
    const requestId = crypto.randomUUID()
    setLoading(true)
    setError("")
    let shouldClearLoading = false

    try {
      const { client, nextActiveJobContext, nextPersonaText, resumeJson } = await getGenerationContext()
      const sortedSteps = [...steps].sort((left, right) => left.pageIndex - right.pageIndex)
      const totalSelected = sortedSteps.reduce(
        (total, step) => total + countSelectedAiFields(step.fields, step.answers, step.includedFlaggedFieldIds || []),
        0
      )

      if (totalSelected === 0) {
        setError("No active questions are selected for AI across the scanned steps.")
        shouldClearLoading = true
        return
      }

      await syncDraftState(
        "answered",
        fields,
        answers,
        fieldCount,
        frameId,
        pageIndex,
        pageKey || `step-${pageIndex}`,
        pageUrl,
        includedFlaggedFieldIds,
        undefined,
        {
          id: requestId,
          kind: "generate_answers"
        },
        "replace-current-step"
      )

      let nextSteps = sortedSteps.map((step) => ({
        ...step,
        answers: step.answers.map((answer) => ({ ...answer })),
        retainedAnswers: (step.retainedAnswers || []).map((answer) => ({ ...answer }))
      }))

      for (let index = 0; index < nextSteps.length; index += 1) {
        const latestSessionBeforeStep = normalizeFillFormSession(await getStorage("fillform_session"))
        if (latestSessionBeforeStep?.inFlightRequest?.id !== requestId) {
          debug("FillForm", "Aborting all-step generation due to stale request", requestId)
          return
        }

        const step = nextSteps[index]
        const stepSelectedFields = getSelectedAiFields(step.fields, step.answers, step.includedFlaggedFieldIds || [])
        if (stepSelectedFields.length === 0) {
          continue
        }

        const priorAnswers = nextSteps
          .slice(0, index)
          .flatMap((candidateStep) => getPersistedStepAnswers(candidateStep))
          .filter((answer) => answer.field_type !== "file")
          .map((answer) => ({
            field_id: answer.field_id,
            question: answer.label,
            answer: answer.answer,
            field_type: answer.field_type
          }))

        const result = await client.fillForm({
          form_fields: stepSelectedFields,
          resume_json: resumeJson,
          persona_text: nextPersonaText || undefined,
          job_description: nextActiveJobContext?.job_description || undefined,
          structured_job_description: nextActiveJobContext?.structured_job_description || undefined,
          prior_answers: priorAnswers
        })

        const generatedAnswers = result.answers.map((answer) => ({
          field_id: answer.field_id || "",
          label: answer.label || "",
          answer: answer.answer || "",
          field_type: answer.field_type || "text"
        }))

        const mergedAnswers = mergeGeneratedAnswersIntoDraftCards(
          step.fields,
          step.answers,
          generatedAnswers,
          step.includedFlaggedFieldIds || []
        )

        nextSteps = nextSteps.map((candidateStep, candidateIndex) =>
          candidateIndex === index
            ? {
                ...candidateStep,
                answers: mergedAnswers.map(({ copied, ...answer }) => answer)
              }
            : candidateStep
        )
      }

      const targetStep =
        nextSteps.find((step) => step.pageKey === (pageKey || `step-${pageIndex}`)) ||
        nextSteps.find((step) => step.pageIndex === pageIndex) ||
        nextSteps[nextSteps.length - 1]

      if (targetStep) {
        await persistCurrentStepSelection(targetStep, nextSteps)
      }
      shouldClearLoading = true
    } catch (err) {
      debugError("FillForm", "all-step fill-form failed:", err)
      const latestSession = normalizeFillFormSession(await getStorage("fillform_session"))
      if (latestSession?.inFlightRequest?.id === requestId) {
        await syncDraftState(
          "answered",
          fields,
          answers,
          fieldCount,
          frameId,
          pageIndex,
          pageKey || `step-${pageIndex}`,
          pageUrl,
          includedFlaggedFieldIds,
          undefined,
          null,
          "replace-current-step"
        )
      }
      setError(err instanceof Error ? err.message : "Failed to generate answers across the scanned steps")
      shouldClearLoading = true
    } finally {
      if (shouldClearLoading) {
        setLoading(false)
      }
    }
  }, [answers, fieldCount, fields, frameId, getGenerationContext, includedFlaggedFieldIds, pageIndex, pageKey, pageUrl, persistCurrentStepSelection, steps, syncDraftState])

  const handleStartManualAnswers = useCallback(async () => {
    setError("")

    if (!isUnlocked) {
      setError("Tailor a resume first in the Resume tab to unlock Fill Form for this job.")
      return
    }

    const manualAnswers = buildDraftAnswerCards(fields, answers)

    if (manualAnswers.length === 0) {
      setError("There are no extracted fields to answer manually.")
      return
    }

    setAnswers(manualAnswers)
    setAutofillResults([])
    setShouldPromptRescanCurrentPage(false)
    setPhase("answered")
    await syncDraftState(
      "answered",
      fields,
      manualAnswers,
      fieldCount,
      frameId,
      pageIndex,
      pageKey || `step-${pageIndex}`,
      pageUrl,
      includedFlaggedFieldIds,
      undefined,
      null,
      "replace-current-step"
    )
  }, [answers, fieldCount, fields, frameId, includedFlaggedFieldIds, isUnlocked, pageIndex, pageKey, pageUrl, syncDraftState])

  const persistAnswerCards = useCallback((nextAnswers: AnswerCard[], nextIncludedFlaggedFieldIds: string[] = includedFlaggedFieldIds) => {
    setAnswers(nextAnswers)
    setIncludedFlaggedFieldIds(nextIncludedFlaggedFieldIds)
    setAutofillResults([])
    setShouldPromptRescanCurrentPage(false)
    void syncDraftState(
      "answered",
      fields,
      nextAnswers,
      fieldCount,
      frameId,
      pageIndex,
      pageKey || `step-${pageIndex}`,
      pageUrl,
      nextIncludedFlaggedFieldIds,
      undefined,
      null,
      "replace-current-step"
    )
  }, [fieldCount, fields, frameId, includedFlaggedFieldIds, pageIndex, pageKey, pageUrl, syncDraftState])

  const handleCopy = useCallback(async (idx: number) => {
    const answer = answers[idx]
    await navigator.clipboard.writeText(answer.answer)
    setAnswers((previous) => previous.map((item, itemIndex) => (itemIndex === idx ? { ...item, copied: true } : item)))
    setTimeout(() => {
      setAnswers((previous) => previous.map((item, itemIndex) => (itemIndex === idx ? { ...item, copied: false } : item)))
    }, 2000)
  }, [answers])

  const handleCopyAll = useCallback(async () => {
    const text = answers
      .filter((answer) => !isAnswerRemoved(answer) && hasAnswerValue(answer))
      .map((answer) => `${answer.label}\n${answer.answer}`)
      .join("\n\n")
    await navigator.clipboard.writeText(text)
  }, [answers])

  const handleAnswerChange = useCallback(
    (idx: number, value: string) => {
      const nextAnswers = answers.map((answer, answerIdx) =>
        answerIdx === idx ? { ...answer, answer: value, file_upload_source: undefined, file_upload: null } : answer
      )
      persistAnswerCards(nextAnswers)
    },
    [answers, persistAnswerCards]
  )

  const handleToggleAiSelection = useCallback((idx: number, checked: boolean) => {
    const targetAnswer = answers[idx]
    if (!targetAnswer) return

    const targetField = fields.find((field) => field.field_id === targetAnswer.field_id)
    if (!targetField) return

    let nextIncludedFlaggedFieldIds = includedFlaggedFieldIds
    if (isSoftOverrideField(targetField)) {
      const alreadyIncluded = includedFlaggedFieldIds.includes(targetField.field_id)
      if (checked && !alreadyIncluded) {
        if (includedFlaggedFieldIds.length >= MAX_SOFT_FLAGGED_OVERRIDES) {
          setError(`You can include up to ${MAX_SOFT_FLAGGED_OVERRIDES} flagged fields in AI generation.`)
          return
        }
        nextIncludedFlaggedFieldIds = [...includedFlaggedFieldIds, targetField.field_id]
      } else if (!checked && alreadyIncluded) {
        nextIncludedFlaggedFieldIds = includedFlaggedFieldIds.filter((fieldId) => fieldId !== targetField.field_id)
      }
    } else if (checked && getEffectiveAiSkipReason(targetField, includedFlaggedFieldIds)) {
      setError(targetField.ai_skip_reason || "This field must stay manual.")
      return
    }

    setError("")
    const nextAnswers = answers.map((answer, answerIdx) =>
      answerIdx === idx ? { ...answer, ai_selected: checked } : answer
    )
    persistAnswerCards(nextAnswers, nextIncludedFlaggedFieldIds)
  }, [answers, fields, includedFlaggedFieldIds, persistAnswerCards])

  const handleRemoveQuestion = useCallback(async (idx: number) => {
    const targetAnswer = answers[idx]
    if (!targetAnswer) return

    const targetField = fields.find((field) => field.field_id === targetAnswer.field_id)
    const nextIncludedFlaggedFieldIds =
      targetField && isSoftOverrideField(targetField)
        ? includedFlaggedFieldIds.filter((fieldId) => fieldId !== targetField.field_id)
        : includedFlaggedFieldIds

    const nextAnswers = answers.map((answer, answerIdx) =>
      answerIdx === idx
        ? { ...answer, removed: true }
        : answer
    )

    setError("")
    persistAnswerCards(nextAnswers, nextIncludedFlaggedFieldIds)
  }, [answers, fields, includedFlaggedFieldIds, persistAnswerCards])

  const handleRestoreQuestion = useCallback(async (fieldId: string) => {
    const restoredField = fields.find((field) => field.field_id === fieldId)
    const existingAnswerIndex = answers.findIndex((answer) => answer.field_id === fieldId)
    if (existingAnswerIndex < 0 || !restoredField) return

    const wantsAiByDefault = !getEffectiveAiSkipReason(restoredField, includedFlaggedFieldIds)
    let nextIncludedFlaggedFieldIds = includedFlaggedFieldIds

    if (isSoftOverrideField(restoredField) && answers[existingAnswerIndex].ai_selected && !includedFlaggedFieldIds.includes(fieldId)) {
      if (includedFlaggedFieldIds.length < MAX_SOFT_FLAGGED_OVERRIDES) {
        nextIncludedFlaggedFieldIds = [...includedFlaggedFieldIds, fieldId]
      }
    }

    const nextAnswers = answers.map((answer) =>
      answer.field_id === fieldId
        ? {
            ...answer,
            removed: false,
            ai_selected: answer.ai_selected ?? wantsAiByDefault
          }
        : answer
    )

    setError("")
    persistAnswerCards(nextAnswers, nextIncludedFlaggedFieldIds)
  }, [answers, fields, includedFlaggedFieldIds, persistAnswerCards])

  const handleUseGeneratedFile = useCallback(async (
    idx: number,
    source: Extract<AutofillFileSource, "tailored-resume" | "cover-letter">
  ) => {
    if (idx < 0 || idx >= answers.length) return

    const nextAnswer = answers[idx]
    if (source === "tailored-resume" && !activeJobContext?.tailored_resume_json) {
      setError("Tailor the resume first before using it for upload fields.")
      return
    }
    if (source === "cover-letter" && !activeJobContext?.cover_letter_text?.trim()) {
      setError("Create a cover letter first before using it for upload fields.")
      return
    }

    setError("")
    const answerLabel =
      source === "tailored-resume"
        ? buildPdfFilename(activeJobContext)
        : buildCoverLetterFilename(activeJobContext)

    const nextAnswers = answers.map((answer, answerIdx) =>
      answerIdx === idx
        ? {
            ...nextAnswer,
            answer: answerLabel,
            file_upload_source: source,
            file_upload: null
          }
        : answer
    )

    persistAnswerCards(nextAnswers)
  }, [activeJobContext, answers, persistAnswerCards])

  const handleUploadLocalFile = useCallback(async (idx: number, file: File | null) => {
    if (!file || idx < 0 || idx >= answers.length) return

    setError("")
    const payload = await fileToPayload(file)
    const nextAnswer = answers[idx]
    const nextAnswers = answers.map((answer, answerIdx) =>
      answerIdx === idx
        ? {
            ...nextAnswer,
            answer: file.name,
            file_upload_source: "local-file" as const,
            file_upload: payload
          }
        : answer
    )

    persistAnswerCards(nextAnswers)
  }, [answers, persistAnswerCards])

  const handleClearFileSelection = useCallback(async (idx: number) => {
    if (idx < 0 || idx >= answers.length) return

    const nextAnswer = answers[idx]
    const nextAnswers = answers.map((answer, answerIdx) =>
      answerIdx === idx
        ? {
            ...nextAnswer,
            answer: "",
            file_upload_source: undefined,
            file_upload: null
          }
        : answer
    )

    persistAnswerCards(nextAnswers)
  }, [answers, persistAnswerCards])

  const handleToggleFlaggedField = useCallback(
    (fieldId: string) => {
      setIncludedFlaggedFieldIds((current) => {
        if (current.includes(fieldId)) {
          const next = current.filter((id) => id !== fieldId)
          void syncDraftState(
            phase,
            fields,
            answers,
            fieldCount,
            frameId,
            pageIndex,
            pageKey || `step-${pageIndex}`,
            pageUrl,
            next,
            undefined,
            null,
            "replace-current-step"
          )
          return next
        }

        if (current.length >= MAX_SOFT_FLAGGED_OVERRIDES) {
          setError(`You can include up to ${MAX_SOFT_FLAGGED_OVERRIDES} flagged fields in AI generation.`)
          return current
        }

        setError("")
        const next = [...current, fieldId]
        void syncDraftState(
          phase,
          fields,
          answers,
          fieldCount,
          frameId,
          pageIndex,
          pageKey || `step-${pageIndex}`,
          pageUrl,
          next,
          undefined,
          null,
          "replace-current-step"
        )
        return next
      })
    },
    [answers, fieldCount, fields, frameId, pageIndex, pageKey, pageUrl, phase, syncDraftState]
  )

  const handleSaveDraft = useCallback(async () => {
    setSavingDraft(true)
    setSaveTone("neutral")
    setSaveMessage("")
    try {
      const context = normalizeActiveJobContext(await getStorage("active_job_context"))
      if (!context || context.phase !== "tailored" || !context.tailored_resume_json) {
        setSaveTone("error")
        setSaveMessage("Tailor the resume first before saving to the tracker.")
        return
      }

      const client = await createApiClient()
      const qaPairs: QAPairItem[] = context.draft_qa_pairs.map((pair) => ({
        field_id: pair.field_id,
        question: pair.label,
        answer: pair.answer,
        field_type: pair.field_type,
        edited_by_user: true
      }))

      const result = await client.saveApplicationDraft({
        job_id: context.job_id || undefined,
        company: context.company || "Unknown Company",
        title: context.job_title || "Unknown Position",
        url: context.job_url || undefined,
        job_description: context.job_description,
        structured_job_description: context.structured_job_description || undefined,
        cover_letter_text: context.cover_letter_text || undefined,
        tailored_resume_json: context.tailored_resume_json,
        qa_pairs: qaPairs
      })

      const savedJobId = result.job.id
      await Promise.all([
        setStorage("active_job_context", {
          ...context,
          job_id: savedJobId,
          company: result.job.company,
          job_title: result.job.title,
          persistence_state: "saved"
        }),
        setStorage("resume_session", {
          phase: "tailored",
          jobId: savedJobId,
          jdText: context.job_description,
          structuredJobDescription: context.structured_job_description || null,
          company: result.job.company,
          jobTitle: result.job.title,
          jobUrl: context.job_url,
          pageTitle: context.page_title,
          pageExcerpt: context.page_excerpt,
          metadataLines: context.metadata_lines,
          tailoredJson: context.tailored_resume_json,
          matchScore: 0,
          inFlightRequest: null
        })
      ])

      setSaveTone("success")
      setSaveMessage(
        result.qa_pairs.length > 0
          ? `Saved to tracker with ${result.qa_pairs.length} reviewed answer${result.qa_pairs.length === 1 ? "" : "s"}.`
          : "Saved to tracker."
      )
    } catch (err) {
      debugError("FillForm", "Save draft failed:", err)
      setSaveTone("error")
      setSaveMessage(err instanceof Error ? err.message : "Failed to save draft to tracker")
    } finally {
      setSavingDraft(false)
    }
  }, [])

  const handleAutofillForm = useCallback(async () => {
    setAutofillLoading(true)
    setError("")
    try {
      const activeAnswers = answers.filter((answer) => !isAnswerRemoved(answer))
      const activeFieldIds = new Set(activeAnswers.map((answer) => answer.field_id))
      const activeFields = fields.filter((field) => activeFieldIds.has(field.field_id))
      let client: Awaited<ReturnType<typeof createApiClient>> | null = null
      let cachedResumePayload: AutofillFilePayload | null | undefined
      let cachedCoverLetterPayload: AutofillFilePayload | null | undefined
      const fileFieldIssues = new Map<string, { status: "skipped" | "failed"; reason: string }>()

      const resolvedAnswers = await Promise.all(
        activeAnswers.map(async (answer) => {
          if (answer.field_type !== "file") return answer

          if (answer.file_upload_source === "local-file") {
            if (answer.file_upload) return answer
            fileFieldIssues.set(answer.field_id, {
              status: "failed",
              reason: "Selected local file could not be read"
            })
            return { ...answer, file_upload: null }
          }

          if (answer.file_upload_source === "tailored-resume") {
            const tailoredResumeJson = activeJobContext?.tailored_resume_json
            if (!tailoredResumeJson) {
              fileFieldIssues.set(answer.field_id, {
                status: "failed",
                reason: "No tailored resume is available for upload"
              })
              return { ...answer, file_upload: null }
            }

            if (cachedResumePayload === undefined) {
              try {
                client = client || await createApiClient()
                const blob = await client.generatePdf(tailoredResumeJson)
                cachedResumePayload = {
                  filename: buildPdfFilename(activeJobContext),
                  mime_type: "application/pdf",
                  base64_data: arrayBufferToBase64(await blob.arrayBuffer())
                }
              } catch (err) {
                cachedResumePayload = null
                fileFieldIssues.set(answer.field_id, {
                  status: "failed",
                  reason: err instanceof Error ? err.message : "Could not generate the tailored resume PDF"
                })
                return { ...answer, file_upload: null }
              }
            }

            if (!cachedResumePayload) {
              fileFieldIssues.set(answer.field_id, {
                status: "failed",
                reason: "Could not generate the tailored resume PDF"
              })
              return { ...answer, file_upload: null }
            }

            return { ...answer, file_upload: cachedResumePayload }
          }

          if (answer.file_upload_source === "cover-letter") {
            const coverLetterText = activeJobContext?.cover_letter_text?.trim()
            if (!coverLetterText) {
              fileFieldIssues.set(answer.field_id, {
                status: "failed",
                reason: "No generated cover letter is available for upload"
              })
              return { ...answer, file_upload: null }
            }

            if (cachedCoverLetterPayload === undefined) {
              cachedCoverLetterPayload = textToPayload(
                coverLetterText,
                buildCoverLetterFilename(activeJobContext)
              )
            }

            return { ...answer, file_upload: cachedCoverLetterPayload }
          }

          fileFieldIssues.set(answer.field_id, {
            status: "skipped",
            reason: "No file selected for this upload field"
          })
          return { ...answer, file_upload: null }
        })
      )

      const result: AutofillFormResponse = await sendToContentScript(
        "AUTOFILL_FORM",
        {
          fields: activeFields,
          answers: resolvedAnswers.map(({ field_id, label, answer, field_type, file_upload, file_upload_source }) => ({
            field_id,
            label,
            answer,
            field_type,
            file_upload_source,
            file_upload
          }))
        },
        { frameId }
      )

      debug("FillForm", "AUTOFILL_FORM response:", {
        url: result.url,
        success: result.success,
        diagnostics: result.diagnostics,
        results: result.results
      })

      if (!result.success) {
        const siteHint = result.diagnostics?.page_hint || ""
        const pageError = result.error || "The page rejected autofill."
        const siteSpecific =
          siteHint === "jobstreet"
            ? " JobStreet rejected scripted autofill on this page. Try manual input for the affected fields, then rescan this page if follow-up questions appear."
            : ""
        const diagnosticSummary = describeDiagnostics(result.diagnostics)
        throw new Error(
          `${pageError}${siteSpecific} Try refreshing the page and extracting the fields again.${diagnosticSummary ? ` ${diagnosticSummary}` : ""}`
        )
      }

      const nextResults = (result.results || []).map((item) => {
        const issue = fileFieldIssues.get(item.field_id)
        if (issue) {
          return {
            ...item,
            status: issue.status,
            reason: issue.reason
          }
        }
        return item
      })

      setAutofillResults(nextResults)
      setShouldPromptRescanCurrentPage(nextResults.length > 0)
      debug("FillForm", "AUTOFILL_FORM summarized results", {
        summary: getAutofillSummary(nextResults),
        diagnostics: result.diagnostics
      })
    } catch (err) {
      debugError("FillForm", "AUTOFILL_FORM failed:", err)
      setError(err instanceof Error ? err.message : "Failed to autofill the form")
    } finally {
      setAutofillLoading(false)
    }
  }, [activeJobContext, answers, fields, frameId])

  const handleReset = useCallback(() => {
    clearFillFormState()
    setAutofillResults([])
    setError("")
    setSaveTone("neutral")
    setSaveMessage("")
    void setStorage("fillform_session", null)
    void getStorage("active_job_context").then((context) => {
      const normalized = normalizeActiveJobContext(context)
      if (!normalized) return
      void setStorage("active_job_context", {
        ...normalized,
        persistence_state: "draft",
        draft_qa_pairs: []
      })
    })
  }, [clearFillFormState])

  const aiEligibleFields = fields.filter((field) => !getEffectiveAiSkipReason(field, includedFlaggedFieldIds))
  const selectedAiFieldCount = countSelectedAiFields(fields, answers, includedFlaggedFieldIds)
  const allScannedSelectedAiFieldCount = [...steps].reduce(
    (total, step) => total + countSelectedAiFields(step.fields, step.answers, step.includedFlaggedFieldIds || []),
    0
  )
  const softOverrideFields = fields
    .map((field) => ({
      ...field,
      effective_skip_reason: getEffectiveAiSkipReason(field, includedFlaggedFieldIds),
      is_included: includedFlaggedFieldIds.includes(field.field_id)
    }))
    .filter((field) => field.ai_skip_reason && isSoftOverrideField(field))
  const skippedFields = fields
    .map((field) => ({
      ...field,
      effective_skip_reason: getEffectiveAiSkipReason(field, includedFlaggedFieldIds)
    }))
    .filter((field) => field.effective_skip_reason)
  const priorAnswerPreview = [...steps]
    .filter((step) => !(step.pageKey === pageKey && step.pageIndex === pageIndex))
    .sort((left, right) => left.pageIndex - right.pageIndex)
    .flatMap((step) =>
      getStepContextAnswers(step)
        .filter(isPersistableAnswer)
        .map((answer) => ({
          pageIndex: step.pageIndex,
          question: answer.label,
          answer: answer.answer
        }))
    )
  const stepSummaries = [...steps].sort((left, right) => left.pageIndex - right.pageIndex)
    .map((step) => ({
      pageIndex: step.pageIndex,
      fieldCount: step.fieldCount,
      answeredCount: countVisibleAnsweredQuestions(step.answers),
      isCurrent: step.pageIndex === pageIndex
    }))

  return {
    phase,
    loading,
    error,
    personaText,
    fields,
    answers,
    autofillResults,
    autofillLoading,
    fieldCount,
    frameId,
    activeJobContext,
    savingDraft,
    saveTone,
    saveMessage,
    includedFlaggedFieldIds,
    isUnlocked,
    recoveredWithoutResumeContext:
      phase !== "idle" &&
      (!activeJobContext?.job_description || (phase === "answered" && activeJobContext?.phase !== "tailored")),
    hasPersona: Boolean(personaText),
    hasSavedJobWithLocalDraft: activeJobContext?.persistence_state === "draft" && Boolean(activeJobContext?.job_id),
    aiEligibleFields,
    softOverrideFields,
    skippedFields,
    fileFieldCount: fields.filter((field) => field.type === "file").length,
    selectedSoftOverrideCount: softOverrideFields.filter((field) => field.is_included).length,
    answerableFieldCount: aiEligibleFields.length,
    selectedAiFieldCount,
    allScannedSelectedAiFieldCount,
    needsBatchGeneration:
      selectedAiFieldCount > MAX_AI_FIELDS_PER_BATCH ||
      estimateFieldSetPayloadLength(getSelectedAiFields(fields, answers, includedFlaggedFieldIds)) > MAX_SINGLE_PASS_FIELD_PAYLOAD,
    autofillSummary: getAutofillSummary(autofillResults),
    currentPageIndex: pageIndex,
    totalScannedSteps: stepSummaries.length,
    accumulatedAnswerCount: allQaPairs.length,
    shouldPromptRescanCurrentPage,
    priorAnswerCount: priorAnswerPreview.length,
    priorAnswerPreview,
    stepSummaries,
    handleSelectStep,
    handleExtractForm,
    handleRescanCurrentPage,
    handlePrepareNextStep,
    handleFillForm,
    handleFillAllScannedSteps,
    handleStartManualAnswers,
    handleCopy,
    handleCopyAll,
    handleAnswerChange,
    handleToggleAiSelection,
    handleRemoveQuestion,
    handleRestoreQuestion,
    handleUseGeneratedFile,
    handleUploadLocalFile,
    handleClearFileSelection,
    handleToggleFlaggedField,
    handleSaveDraft,
    handleAutofillForm,
    handleReset
  }
}
