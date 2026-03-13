import { useCallback, useEffect, useState } from "react"

import { createApiClient, type QAPairItem } from "~lib/api"
import { debug, debugError } from "~lib/debug"
import { sendToContentScript } from "~lib/messaging"
import {
  getStorage,
  normalizeActiveJobContext,
  normalizeFillFormSession,
  setStorage,
  type ActiveJobContext,
  type InFlightRequest
} from "~lib/storage"
import type {
  AutofillAnswerInput,
  AutofillFormResponse,
  AutofillResultItem,
  AutofillResumeFilePayload,
  ExtractFormResponse,
  FormField,
  ResumeJson
} from "~lib/types"

export interface AnswerCard extends AutofillAnswerInput {
  copied: boolean
}

export type FillFormPhase = "idle" | "extracted" | "answered"
export type GenerationMode = "single" | "batch"

export const MAX_AI_FIELDS_PER_BATCH = 12
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

function sortAnswersByFieldOrder(sourceFields: FormField[], cards: AnswerCard[]): AnswerCard[] {
  const fieldOrder = new Map(sourceFields.map((field, index) => [field.field_id, index]))
  return [...cards].sort((left, right) => {
    const leftIndex = fieldOrder.get(left.field_id) ?? Number.MAX_SAFE_INTEGER
    const rightIndex = fieldOrder.get(right.field_id) ?? Number.MAX_SAFE_INTEGER
    return leftIndex - rightIndex
  })
}

function buildPdfFilename(context: ActiveJobContext | null): string {
  const segments = [context?.company || "company", context?.job_title || "resume"]
    .map((segment) => segment.replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, ""))
    .filter(Boolean)

  return `${segments.join("_") || "tailored_resume"}.pdf`
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
  needsBatchGeneration: boolean
  autofillSummary: ReturnType<typeof getAutofillSummary>
  handleExtractForm: () => Promise<void>
  handleFillForm: (mode?: GenerationMode) => Promise<void>
  handleCopy: (idx: number) => Promise<void>
  handleCopyAll: () => Promise<void>
  handleAnswerChange: (idx: number, value: string) => void
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
  const [activeJobContext, setActiveJobContext] = useState<ActiveJobContext | null>(null)
  const [savingDraft, setSavingDraft] = useState(false)
  const [saveTone, setSaveTone] = useState<"neutral" | "success" | "error">("neutral")
  const [saveMessage, setSaveMessage] = useState("")
  const [includedFlaggedFieldIds, setIncludedFlaggedFieldIds] = useState<string[]>([])

  const applyFillFormSession = useCallback((session: ReturnType<typeof normalizeFillFormSession>) => {
    if (!session) {
      setFrameId(null)
      setIncludedFlaggedFieldIds([])
      setLoading(false)
      return
    }

    setPhase(session.phase as FillFormPhase)
    setFields(session.fields as FormField[])
    setAnswers(session.answers.map((answer) => ({ ...answer, copied: false })))
    setFieldCount(session.fieldCount)
    setFrameId(session.frameId ?? null)
    setIncludedFlaggedFieldIds(session.includedFlaggedFieldIds || [])
    setLoading(session.inFlightRequest?.kind === "generate_answers")
  }, [])

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
      nextIncludedFlaggedFieldIds: string[] = includedFlaggedFieldIds,
      inFlightRequest: InFlightRequest | null = null
    ) => {
      const normalizedIncludedFlaggedFieldIds = nextIncludedFlaggedFieldIds.filter((fieldId) =>
        nextFields.some((field) => field.field_id === fieldId && isSoftOverrideField(field))
      )

      await setStorage("fillform_session", {
        phase: nextPhase,
        fields: nextFields,
        answers: nextAnswers.map(({ copied, ...answer }) => answer),
        fieldCount: nextFieldCount,
        frameId: nextFrameId,
        includedFlaggedFieldIds: normalizedIncludedFlaggedFieldIds,
        inFlightRequest
      })

      const context = normalizeActiveJobContext(await getStorage("active_job_context"))
      if (!context) return

      await setStorage("active_job_context", {
        ...context,
        persistence_state: "draft",
        draft_qa_pairs: nextAnswers.map(({ field_id, label, answer, field_type }) => ({
          field_id,
          label,
          answer,
          field_type
        }))
      })
    },
    [frameId, includedFlaggedFieldIds]
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
          setLoading(false)
        }
      }
    }

    chrome.storage.onChanged.addListener(handleStorageChange)
    return () => {
      mounted = false
      chrome.storage.onChanged.removeListener(handleStorageChange)
    }
  }, [applyFillFormSession])

  const handleExtractForm = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      debug("FillForm", "Sending EXTRACT_FORM to content script...")
      const result: ExtractFormResponse = await sendToContentScript("EXTRACT_FORM")
      debug("FillForm", "EXTRACT_FORM response:", result)
      if (!result.success) {
        setError("The page rejected form extraction. Try refreshing the page and scanning again.")
        return
      }
      if (result.fields.length === 0) {
        setError("No form fields found on this page or in accessible embedded frames. Make sure you're on an application form page.")
        return
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
      setFields(result.fields)
      setFieldCount(result.fields.length)
      setFrameId(typeof result.frame_id === "number" ? result.frame_id : null)
      setIncludedFlaggedFieldIds([])
      setAutofillResults([])
      setPhase("extracted")
      await syncDraftState("extracted", result.fields, [], result.fields.length, result.frame_id ?? null, [])
    } catch (err) {
      debugError("FillForm", "EXTRACT_FORM failed:", err)
      setError(err instanceof Error ? err.message : "Could not connect to the page. Try refreshing the page.")
    } finally {
      setLoading(false)
    }
  }, [syncDraftState])

  const handleFillForm = useCallback(
    async (mode: GenerationMode = "single") => {
      const requestId = crypto.randomUUID()
      setLoading(true)
      setError("")
      let shouldClearLoading = false
      try {
        if (!isUnlocked) {
          setError("Tailor a resume first in the Resume tab to unlock Fill Form for this job.")
          shouldClearLoading = true
          return
        }

        const [baseResumeJson, nextActiveJobContext] = await Promise.all([
          getStorage("base_resume_json"),
          getStorage("active_job_context")
        ])
        const personaTextRaw = await getStorage("persona_text")
        const nextPersonaText = typeof personaTextRaw === "string" ? personaTextRaw.trim() : ""
        const resumeJson: ResumeJson | null = nextActiveJobContext?.tailored_resume_json || baseResumeJson
        if (!resumeJson) {
          setError("No resume found. Go to Settings and add your base resume first.")
          shouldClearLoading = true
          return
        }

        const client = await createApiClient()
        const aiEligibleFields = fields.filter(
          (field) => !getEffectiveAiSkipReason(field, includedFlaggedFieldIds)
        )
        if (aiEligibleFields.length === 0) {
          setError("This form has no AI-answerable fields after the current guardrails. Complete the skipped fields manually.")
          shouldClearLoading = true
          return
        }

        const needsBatchGeneration =
          aiEligibleFields.length > MAX_AI_FIELDS_PER_BATCH ||
          estimateFieldSetPayloadLength(aiEligibleFields) > MAX_SINGLE_PASS_FIELD_PAYLOAD

        if (needsBatchGeneration && mode === "single") {
          setError("This form is too large for one AI pass. Review the skipped fields below or use Generate in Batches.")
          shouldClearLoading = true
          return
        }

        await syncDraftState("extracted", fields, answers, fieldCount, frameId, includedFlaggedFieldIds, {
          id: requestId,
          kind: "generate_answers"
        })
        const batches =
          mode === "batch"
            ? buildFieldBatches(aiEligibleFields, MAX_AI_FIELDS_PER_BATCH, MAX_BATCH_FIELD_PAYLOAD)
            : [aiEligibleFields]

        debug("FillForm", "Calling fill-form with", aiEligibleFields.length, "AI-answerable fields in", batches.length, "batch(es)")

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
            structured_job_description: nextActiveJobContext?.structured_job_description || undefined
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

        const cards = sortAnswersByFieldOrder(fields, collectedAnswers)
        const latestSession = normalizeFillFormSession(await getStorage("fillform_session"))
        if (latestSession?.inFlightRequest?.id !== requestId) {
          debug("FillForm", "Ignoring stale fill-form response for request", requestId)
          return
        }
        setAnswers(cards)
        setAutofillResults([])
        setPhase("answered")
        await syncDraftState("answered", fields, cards, fieldCount, frameId, includedFlaggedFieldIds, null)
        shouldClearLoading = true
      } catch (err) {
        debugError("FillForm", "fill-form failed:", err)
        const latestSession = normalizeFillFormSession(await getStorage("fillform_session"))
        if (latestSession?.inFlightRequest?.id === requestId) {
          await syncDraftState("extracted", fields, answers, fieldCount, frameId, includedFlaggedFieldIds, null)
          shouldClearLoading = true
        }
        setError(err instanceof Error ? err.message : "Failed to generate answers")
      } finally {
        if (shouldClearLoading) {
          setLoading(false)
        }
      }
    },
    [answers, fieldCount, fields, frameId, includedFlaggedFieldIds, isUnlocked, syncDraftState]
  )

  const handleCopy = useCallback(async (idx: number) => {
    const answer = answers[idx]
    await navigator.clipboard.writeText(answer.answer)
    setAnswers((previous) => previous.map((item, itemIndex) => (itemIndex === idx ? { ...item, copied: true } : item)))
    setTimeout(() => {
      setAnswers((previous) => previous.map((item, itemIndex) => (itemIndex === idx ? { ...item, copied: false } : item)))
    }, 2000)
  }, [answers])

  const handleCopyAll = useCallback(async () => {
    const text = answers.map((answer) => `${answer.label}\n${answer.answer}`).join("\n\n")
    await navigator.clipboard.writeText(text)
  }, [answers])

  const handleAnswerChange = useCallback(
    (idx: number, value: string) => {
      const nextAnswers = answers.map((answer, answerIdx) =>
        answerIdx === idx ? { ...answer, answer: value } : answer
      )
      setAnswers(nextAnswers)
      setAutofillResults([])
      void syncDraftState("answered", fields, nextAnswers, fieldCount, frameId, includedFlaggedFieldIds)
    },
    [answers, fieldCount, fields, frameId, includedFlaggedFieldIds, syncDraftState]
  )

  const handleToggleFlaggedField = useCallback(
    (fieldId: string) => {
      setIncludedFlaggedFieldIds((current) => {
        if (current.includes(fieldId)) {
          const next = current.filter((id) => id !== fieldId)
          void syncDraftState(phase, fields, answers, fieldCount, frameId, next)
          return next
        }

        if (current.length >= MAX_SOFT_FLAGGED_OVERRIDES) {
          setError(`You can include up to ${MAX_SOFT_FLAGGED_OVERRIDES} flagged fields in AI generation.`)
          return current
        }

        setError("")
        const next = [...current, fieldId]
        void syncDraftState(phase, fields, answers, fieldCount, frameId, next)
        return next
      })
    },
    [answers, fieldCount, fields, frameId, phase, syncDraftState]
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
      let resumeFilePayload: AutofillResumeFilePayload | undefined
      let resumeUploadFailureReason = ""
      const fileFields = fields.filter((field) => field.type === "file")

      if (fileFields.length > 0) {
        const tailoredResumeJson = activeJobContext?.tailored_resume_json
        if (!tailoredResumeJson) {
          resumeUploadFailureReason = "No tailored resume is available for upload"
        } else {
          try {
            const client = await createApiClient()
            const blob = await client.generatePdf(tailoredResumeJson)
            resumeFilePayload = {
              filename: buildPdfFilename(activeJobContext),
              mime_type: "application/pdf",
              base64_data: arrayBufferToBase64(await blob.arrayBuffer())
            }
          } catch (err) {
            resumeUploadFailureReason =
              err instanceof Error ? err.message : "Could not generate the tailored resume PDF"
          }
        }
      }

      const result: AutofillFormResponse = await sendToContentScript(
        "AUTOFILL_FORM",
        {
          fields,
          answers: answers.map(({ field_id, label, answer, field_type }) => ({
            field_id,
            label,
            answer,
            field_type
          })),
          resume_file: resumeFilePayload
        },
        { frameId }
      )

      if (!result.success) {
        throw new Error("The page rejected autofill. Try refreshing the page and extracting the fields again.")
      }

      const nextResults = (result.results || []).map((item) => {
        if (resumeUploadFailureReason && fields.some((field) => field.field_id === item.field_id && field.type === "file")) {
          return {
            ...item,
            status: "failed" as const,
            reason: resumeUploadFailureReason
          }
        }
        return item
      })

      setAutofillResults(nextResults)
    } catch (err) {
      debugError("FillForm", "AUTOFILL_FORM failed:", err)
      setError(err instanceof Error ? err.message : "Failed to autofill the form")
    } finally {
      setAutofillLoading(false)
    }
  }, [activeJobContext, answers, fields, frameId])

  const handleReset = useCallback(() => {
    setPhase("idle")
    setLoading(false)
    setFields([])
    setAnswers([])
    setAutofillResults([])
    setFieldCount(0)
    setFrameId(null)
    setIncludedFlaggedFieldIds([])
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
  }, [])

  const aiEligibleFields = fields.filter((field) => !getEffectiveAiSkipReason(field, includedFlaggedFieldIds))
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
    needsBatchGeneration:
      aiEligibleFields.length > MAX_AI_FIELDS_PER_BATCH ||
      estimateFieldSetPayloadLength(aiEligibleFields) > MAX_SINGLE_PASS_FIELD_PAYLOAD,
    autofillSummary: getAutofillSummary(autofillResults),
    handleExtractForm,
    handleFillForm,
    handleCopy,
    handleCopyAll,
    handleAnswerChange,
    handleToggleFlaggedField,
    handleSaveDraft,
    handleAutofillForm,
    handleReset
  }
}
