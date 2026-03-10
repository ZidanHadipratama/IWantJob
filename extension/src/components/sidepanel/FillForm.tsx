import { useState, useEffect, useCallback } from "react"
import { ClipboardList, Loader, AlertCircle, Copy, CheckCircle, Lock, RefreshCw, Save } from "lucide-react"
import { createApiClient, type QAPairItem } from "~lib/api"
import {
  getStorage,
  type InFlightRequest,
  normalizeActiveJobContext,
  normalizeFillFormSession,
  setStorage,
  type ActiveJobContext
} from "~lib/storage"
import { debug, debugError } from "~lib/debug"
import { sendToContentScript } from "~lib/messaging"
import type {
  AutofillFormResponse,
  AutofillResultItem,
  AutofillResumeFilePayload,
  ExtractFormResponse,
  FormField
} from "~lib/types"

interface AnswerCard {
  field_id: string
  label: string
  answer: string
  field_type: string
  copied: boolean
}

type Phase = "idle" | "extracted" | "answered"

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

function getAutofillSummary(results: AutofillResultItem[]) {
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

  return {
    filled,
    skipped,
    failed,
    toneClass,
    message,
    hasFileIssue
  }
}

export default function FillForm() {
  const [phase, setPhase] = useState<Phase>("idle")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [fields, setFields] = useState<FormField[]>([])
  const [answers, setAnswers] = useState<AnswerCard[]>([])
  const [autofillResults, setAutofillResults] = useState<AutofillResultItem[]>([])
  const [autofillLoading, setAutofillLoading] = useState(false)
  const [fieldCount, setFieldCount] = useState(0)
  const [activeJobContext, setActiveJobContext] = useState<ActiveJobContext | null>(null)
  const [savingDraft, setSavingDraft] = useState(false)
  const [saveTone, setSaveTone] = useState<"neutral" | "success" | "error">("neutral")
  const [saveMessage, setSaveMessage] = useState("")

  const applyFillFormSession = useCallback((session: ReturnType<typeof normalizeFillFormSession>) => {
    if (!session) {
      setLoading(false)
      return
    }

    setPhase(session.phase as Phase)
    setFields(session.fields as FormField[])
    setAnswers((session.answers as AnswerCard[]).map((answer) => ({ ...answer, copied: false })))
    setFieldCount(session.fieldCount)
    setLoading(session.inFlightRequest?.kind === "generate_answers")
  }, [])

  const isUnlocked = Boolean(
    activeJobContext?.phase === "tailored" &&
      activeJobContext?.tailored_resume_json &&
      activeJobContext?.job_description?.trim()
  )

  // Restore session on mount
  useEffect(() => {
    debug("FillForm", "Component mounted")
    Promise.all([
      getStorage("fillform_session"),
      getStorage("active_job_context")
    ]).then(([sessionRaw, contextRaw]) => {
      const session = normalizeFillFormSession(sessionRaw)
      const context = normalizeActiveJobContext(contextRaw)
      if (context) setActiveJobContext(context)

      if (session && session.phase !== "idle") {
        applyFillFormSession(session)
        setAutofillResults([])
        debug("FillForm", "Restored session, phase:", session.phase)
      }
    })
  }, [applyFillFormSession])

  const syncDraftState = useCallback(async (
    nextPhase: Phase,
    nextFields: FormField[],
    nextAnswers: AnswerCard[],
    nextFieldCount: number,
    inFlightRequest: InFlightRequest | null = null
  ) => {
    await setStorage("fillform_session", {
      phase: nextPhase,
      fields: nextFields,
      answers: nextAnswers.map(({ copied, ...answer }) => answer),
      fieldCount: nextFieldCount,
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
  }, [])

  useEffect(() => {
    let mounted = true

    getStorage("active_job_context").then((context) => {
      if (mounted) setActiveJobContext(normalizeActiveJobContext(context))
    })

    function handleStorageChange(
      changes: Record<string, chrome.storage.StorageChange>,
      areaName: string
    ) {
      if (areaName !== "local") return
      if (changes.active_job_context) {
        setActiveJobContext(normalizeActiveJobContext(changes.active_job_context.newValue))
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

  async function handleExtractForm() {
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
        setError("No form fields found on this page. Make sure you're on an application form page.")
        return
      }
      debug("FillForm", `Found ${result.fields.length} fields:`, result.fields.map(f => f.label))
      const fieldsWithOptions = result.fields.filter(f => f.options?.length)
      if (fieldsWithOptions.length) {
        debug("FillForm", `Fields with options (${fieldsWithOptions.length}):`, fieldsWithOptions.map(f => ({ label: f.label, type: f.type, options: f.options })))
      }
      setFields(result.fields)
      setFieldCount(result.fields.length)
      setAutofillResults([])
      setPhase("extracted")
      await syncDraftState("extracted", result.fields, [], result.fields.length)
    } catch (err) {
      debugError("FillForm", "EXTRACT_FORM failed:", err)
      setError(err instanceof Error ? err.message : "Could not connect to the page. Try refreshing the page.")
    } finally {
      setLoading(false)
    }
  }

  async function handleFillForm() {
    const requestId = crypto.randomUUID()
    setLoading(true)
    setError("")
    let shouldClearLoading = false
    try {
      if (!isUnlocked) {
        setError("Tailor a resume first in the Resume tab to unlock Fill Form for this job.")
        return
      }

      const [baseResumeJson, activeJobContext] = await Promise.all([
        getStorage("base_resume_json"),
        getStorage("active_job_context")
      ])
      const resumeJson = activeJobContext?.tailored_resume_json || baseResumeJson
      if (!resumeJson) {
        setError("No resume found. Go to Settings and add your base resume first.")
        return
      }

      const client = await createApiClient()
      const aiEligibleFields = fields.filter((field) => field.type !== "file")
      await syncDraftState("extracted", fields, answers, fieldCount, {
        id: requestId,
        kind: "generate_answers"
      })
      debug("FillForm", "Calling fill-form with", aiEligibleFields.length, "AI-answerable fields")
      const result = await client.fillForm({
        form_fields: aiEligibleFields,
        resume_json: resumeJson,
        job_description: activeJobContext?.job_description || undefined,
      })
      debug("FillForm", "fill-form response:", result)

      const cards = result.answers.map((a: any) => ({
        field_id: a.field_id || "",
        label: a.label || "",
        answer: a.answer || "",
        field_type: a.field_type || "text",
        copied: false,
      }))
      const latestSession = normalizeFillFormSession(await getStorage("fillform_session"))
      if (latestSession?.inFlightRequest?.id !== requestId) {
        debug("FillForm", "Ignoring stale fill-form response for request", requestId)
        return
      }
      setAnswers(cards)
      setAutofillResults([])
      setPhase("answered")
      await syncDraftState("answered", fields, cards, fieldCount, null)
      shouldClearLoading = true
    } catch (err) {
      debugError("FillForm", "fill-form failed:", err)
      const latestSession = normalizeFillFormSession(await getStorage("fillform_session"))
      if (latestSession?.inFlightRequest?.id === requestId) {
        await syncDraftState("extracted", fields, answers, fieldCount, null)
        shouldClearLoading = true
      }
      setError(err instanceof Error ? err.message : "Failed to generate answers")
    } finally {
      if (shouldClearLoading) {
        setLoading(false)
      }
    }
  }

  async function handleCopy(idx: number) {
    const answer = answers[idx]
    await navigator.clipboard.writeText(answer.answer)
    setAnswers(prev =>
      prev.map((a, i) => i === idx ? { ...a, copied: true } : a)
    )
    setTimeout(() => {
      setAnswers(prev =>
        prev.map((a, i) => i === idx ? { ...a, copied: false } : a)
      )
    }, 2000)
  }

  async function handleCopyAll() {
    const text = answers.map(a => `${a.label}\n${a.answer}`).join("\n\n")
    await navigator.clipboard.writeText(text)
  }

  function handleAnswerChange(idx: number, value: string) {
    const nextAnswers = answers.map((answer, answerIdx) =>
      answerIdx === idx ? { ...answer, answer: value } : answer
    )
    setAnswers(nextAnswers)
    setAutofillResults([])
    syncDraftState("answered", fields, nextAnswers, fieldCount)
  }

  async function handleSaveDraft() {
    setSavingDraft(true)
    setSaveTone("neutral")
    setSaveMessage("")
    try {
      const activeContext = normalizeActiveJobContext(await getStorage("active_job_context"))
      if (!activeContext || activeContext.phase !== "tailored" || !activeContext.tailored_resume_json) {
        setSaveTone("error")
        setSaveMessage("Tailor the resume first before saving to the tracker.")
        return
      }

      const client = await createApiClient()
      const qaPairs: QAPairItem[] = activeContext.draft_qa_pairs.map((pair) => ({
        field_id: pair.field_id,
        question: pair.label,
        answer: pair.answer,
        field_type: pair.field_type,
        edited_by_user: true
      }))

      const result = await client.saveApplicationDraft({
        job_id: activeContext.job_id || undefined,
        company: activeContext.company || "Unknown Company",
        title: activeContext.job_title || "Unknown Position",
        url: activeContext.job_url || undefined,
        job_description: activeContext.job_description,
        tailored_resume_json: activeContext.tailored_resume_json,
        qa_pairs: qaPairs
      })

      const savedJobId = result.job.id
      await Promise.all([
        setStorage("active_job_context", {
          ...activeContext,
          job_id: savedJobId,
          company: result.job.company,
          job_title: result.job.title,
          persistence_state: "saved"
        }),
        setStorage("resume_session", {
          phase: "tailored",
          jobId: savedJobId,
          jdText: activeContext.job_description,
          company: result.job.company,
          jobTitle: result.job.title,
          jobUrl: activeContext.job_url,
          pageTitle: activeContext.page_title,
          pageExcerpt: activeContext.page_excerpt,
          metadataLines: activeContext.metadata_lines,
          tailoredJson: activeContext.tailored_resume_json,
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
  }

  async function handleAutofillForm() {
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

      const result: AutofillFormResponse = await sendToContentScript("AUTOFILL_FORM", {
        fields,
        answers: answers.map(({ field_id, label, answer, field_type }) => ({
          field_id,
          label,
          answer,
          field_type
        })),
        resume_file: resumeFilePayload
      })

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
  }

  function handleReset() {
    setPhase("idle")
    setLoading(false)
    setFields([])
    setAnswers([])
    setAutofillResults([])
    setFieldCount(0)
    setError("")
    setSaveTone("neutral")
    setSaveMessage("")
    setStorage("fillform_session", null)
    getStorage("active_job_context").then((context) => {
      const normalized = normalizeActiveJobContext(context)
      if (!normalized) return
      setStorage("active_job_context", {
        ...normalized,
        persistence_state: "draft",
        draft_qa_pairs: []
      })
    })
  }

  const recoveredWithoutResumeContext =
    phase !== "idle" &&
    (!activeJobContext?.job_description || (phase === "answered" && activeJobContext?.phase !== "tailored"))
  const hasSavedJobWithLocalDraft = activeJobContext?.persistence_state === "draft" && Boolean(activeJobContext?.job_id)
  const fileFieldCount = fields.filter((field) => field.type === "file").length
  const answerableFieldCount = fields.filter((field) => field.type !== "file").length
  const autofillSummary = getAutofillSummary(autofillResults)

  return (
    <div className="space-y-4">
      {error && (
        <div className="flex items-start gap-2 text-red-600 bg-red-50 rounded-lg p-3">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <p className="text-sm">{error}</p>
        </div>
      )}

      {recoveredWithoutResumeContext && (
        <div className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          The recovered form draft is missing a complete Resume context. You can still copy your local answers, but re-open the Resume tab and tailor again before saving.
        </div>
      )}

      {/* Phase: Idle */}
      {phase === "idle" && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 ${
            isUnlocked ? "bg-primary-50" : "bg-amber-50"
          }`}>
            {isUnlocked ? (
              <ClipboardList className="w-6 h-6 text-primary" />
            ) : (
              <Lock className="w-6 h-6 text-amber-600" />
            )}
          </div>
          <h2 className="text-lg font-semibold text-text mb-2">Form Assistant</h2>
          <p className="text-sm text-text-muted max-w-[280px] mb-6">
            {isUnlocked
              ? "Open a job application form, then click below to extract the fields and generate AI answers."
              : "Resume tailoring is required first. Use the Resume tab to extract the job and tailor your resume before generating answers."}
          </p>
          <FillFormContextHint context={activeJobContext} />
          <button
            onClick={handleExtractForm}
            disabled={loading}
            className="btn-primary flex items-center gap-2">
            {loading ? <Loader className="w-4 h-4 animate-spin" /> : <ClipboardList className="w-4 h-4" />}
            {loading ? "Scanning..." : "Get Form Fields"}
          </button>
        </div>
      )}

      {/* Phase: Extracted — show field count + generate button */}
      {phase === "extracted" && (
        <>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-text">
              {fieldCount} Fields Found
            </h2>
            <button onClick={handleReset} className="text-xs text-text-muted hover:text-text flex items-center gap-1 cursor-pointer">
              <RefreshCw className="w-3 h-3" /> Rescan
            </button>
          </div>

          <FillFormContextHint context={activeJobContext} />

          <div className="card p-3 space-y-1 max-h-48 overflow-y-auto">
            {fields.map((f, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <span className="text-text-muted font-mono w-16 flex-shrink-0">{f.type}</span>
                <span className="text-text-secondary truncate">{f.label}</span>
                {f.required && <span className="text-red-400 flex-shrink-0">*</span>}
              </div>
            ))}
          </div>

          {fileFieldCount > 0 && (
            <div className="rounded-lg border border-sky-100 bg-sky-50 px-3 py-2 text-xs text-sky-800">
              {fileFieldCount} resume upload field{fileFieldCount > 1 ? "s" : ""} detected. Those field{fileFieldCount > 1 ? "s are" : " is"} handled during `Autofill Form`, not during AI answer generation.
            </div>
          )}

          <button
            onClick={handleFillForm}
            disabled={loading || !isUnlocked}
            className="btn-accent w-full flex items-center justify-center gap-2">
            {loading ? <Loader className="w-4 h-4 animate-spin" /> : <ClipboardList className="w-4 h-4" />}
            {!isUnlocked
              ? "Tailor Resume First"
              : loading
                ? "Generating Answers..."
                : "Generate Answers"}
          </button>

          {loading && (
            <p className="text-xs text-text-muted text-center">This may take a minute depending on your AI model...</p>
          )}
          {isUnlocked && (
            <p className="text-xs text-sky-700 text-center">
              Generated answers stay local here. {answerableFieldCount} field{answerableFieldCount === 1 ? "" : "s"} will be answered by AI, and any file upload fields are handled separately during autofill. Save to the tracker from this tab when your review is done.
            </p>
          )}
          {!isUnlocked && (
            <p className="text-xs text-amber-700 text-center">
              Fill Form unlocks automatically after Resume tailoring completes for the active job.
            </p>
          )}
        </>
      )}

      {/* Phase: Answered — show Q&A cards */}
      {phase === "answered" && (
        <>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-600" />
              <h2 className="text-sm font-semibold text-text">{answers.length} Answers Ready</h2>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={handleCopyAll} className="text-xs text-primary hover:text-primary-700 font-medium cursor-pointer">
                Copy All
              </button>
              <button onClick={handleReset} className="text-xs text-text-muted hover:text-text flex items-center gap-1 cursor-pointer">
                <RefreshCw className="w-3 h-3" /> New Form
              </button>
            </div>
          </div>

          <div className={`rounded-lg border px-3 py-2 text-xs ${
            activeJobContext?.persistence_state === "saved"
              ? "border-emerald-100 bg-emerald-50 text-emerald-800"
              : "border-sky-100 bg-sky-50 text-sky-800"
          }`}>
            {hasSavedJobWithLocalDraft
              ? "You are editing answers for an existing saved job. These local changes are not in Supabase yet; save again from this tab when ready."
              : activeJobContext?.persistence_state === "saved"
              ? "Saved to tracker. Any edits you make here will turn this back into an unsaved draft until you save again from the Resume tab."
              : "Local draft only. Edit these answers freely, autofill if needed, then save to the tracker from this tab."}
          </div>

          <button
            onClick={handleSaveDraft}
            disabled={savingDraft || !isUnlocked}
            className="btn-primary w-full flex items-center justify-center gap-2">
            {savingDraft ? <Loader className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {savingDraft
              ? "Saving..."
              : activeJobContext?.persistence_state === "saved"
                ? "Save Updates to Tracker"
                : "Save to Tracker"}
          </button>
          {saveMessage && (
            <p className={`text-xs text-center ${
              saveTone === "error"
                ? "text-red-600"
                : saveTone === "success"
                  ? "text-green-700"
                  : "text-text-muted"
            }`}>
              {saveMessage}
            </p>
          )}

          <div className="flex flex-col gap-2">
            <button
              onClick={handleAutofillForm}
              disabled={autofillLoading || answers.length === 0}
              className="btn-accent w-full flex items-center justify-center gap-2">
              {autofillLoading ? <Loader className="w-4 h-4 animate-spin" /> : <ClipboardList className="w-4 h-4" />}
              {autofillLoading ? "Autofilling..." : "Autofill Form"}
            </button>
            <p className="text-xs text-text-muted text-center">
              Autofill is best-effort. Standard file inputs can receive the tailored PDF, but custom upload widgets may still require manual upload.
            </p>
          </div>

          {autofillResults.length > 0 && (
            <div className="space-y-2 rounded-lg border border-border bg-white p-3">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-text">Autofill Results</h3>
                <p className="text-xs text-text-muted">
                  {autofillSummary.filled} filled, {autofillSummary.skipped} skipped, {autofillSummary.failed} failed
                </p>
              </div>
              <div className={`rounded-lg border px-3 py-2 text-xs ${autofillSummary.toneClass}`}>
                {autofillSummary.message}
                {autofillSummary.hasFileIssue && (
                  <span className="block pt-1">
                    If the resume upload field still needs work, download the tailored PDF from the Resume tab and upload it manually.
                  </span>
                )}
              </div>
              <div className="space-y-2">
                {autofillResults.map((result) => (
                  <div
                    key={`${result.field_id}-${result.label}`}
                    className={`rounded-lg border px-3 py-2 text-xs ${
                      result.status === "filled"
                        ? "border-emerald-100 bg-emerald-50 text-emerald-800"
                        : result.status === "skipped"
                          ? "border-amber-100 bg-amber-50 text-amber-800"
                          : "border-red-100 bg-red-50 text-red-700"
                    }`}>
                    <div className="flex items-start justify-between gap-3">
                      <span className="font-medium">{result.label}</span>
                      <span className="uppercase tracking-wide">{result.status}</span>
                    </div>
                    {result.reason && (
                      <p className="mt-1 text-[11px]">{result.reason}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-3">
            {answers.map((a, idx) => (
              <div key={idx} className="card p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs font-semibold text-text">{a.label}</p>
                  <button
                    onClick={() => handleCopy(idx)}
                    className="flex-shrink-0 text-text-muted hover:text-primary cursor-pointer"
                    title="Copy answer">
                    {a.copied
                      ? <CheckCircle className="w-3.5 h-3.5 text-green-600" />
                      : <Copy className="w-3.5 h-3.5" />
                    }
                  </button>
                </div>
                <textarea
                  value={a.answer}
                  onChange={(event) => handleAnswerChange(idx, event.target.value)}
                  rows={a.field_type === "textarea" ? 5 : 3}
                  className="min-h-[88px] w-full resize-y rounded-lg border border-border bg-white px-3 py-2 text-sm text-text-secondary outline-none transition focus:border-primary"
                />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function FillFormContextHint({ context }: { context: ActiveJobContext | null }) {
  const role = context?.job_title || "current job"
  const company = context?.company ? ` at ${context.company}` : ""

  let message =
    "No active tailored job context yet. Go to the Resume tab, extract the job description, and tailor your resume first."
  let toneClass = "border-amber-100 bg-amber-50 text-amber-800"

  if (context?.phase === "tailored" && context?.tailored_resume_json && context?.job_description?.trim()) {
    if (context.persistence_state === "saved") {
      message = `Unlocked. This application is already saved for ${role}${company}. New edits here stay local until you save again from the Resume tab.`
      toneClass = "border-emerald-100 bg-emerald-50 text-emerald-800"
    } else {
      message = `Unlocked. Using the unsaved tailored resume + job description from ${role}${company}. Nothing has been saved to the tracker yet.`
      toneClass = "border-sky-100 bg-sky-50 text-sky-800"
    }
  } else if (context?.job_description?.trim()) {
    message = `Job context found for ${role}${company}, but Fill Form stays locked until tailoring finishes.`
  }

  return (
    <div className={`rounded-lg border px-3 py-2 text-xs ${toneClass}`}>
      {message}
    </div>
  )
}
