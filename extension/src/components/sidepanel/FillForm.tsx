import { useState, useEffect, useCallback } from "react"
import { ClipboardList, Loader, AlertCircle, Copy, CheckCircle, Lock, RefreshCw } from "lucide-react"
import { createApiClient } from "~lib/api"
import {
  getStorage,
  normalizeActiveJobContext,
  normalizeFillFormSession,
  setStorage,
  type ActiveJobContext
} from "~lib/storage"
import { debug, debugError } from "~lib/debug"
import { sendToContentScript } from "~lib/messaging"
import type { ExtractFormResponse, FormField } from "~lib/types"

interface AnswerCard {
  field_id: string
  label: string
  answer: string
  field_type: string
  copied: boolean
}

type Phase = "idle" | "extracted" | "answered"

export default function FillForm() {
  const [phase, setPhase] = useState<Phase>("idle")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [fields, setFields] = useState<FormField[]>([])
  const [answers, setAnswers] = useState<AnswerCard[]>([])
  const [fieldCount, setFieldCount] = useState(0)
  const [activeJobContext, setActiveJobContext] = useState<ActiveJobContext | null>(null)

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
        setPhase(session.phase as Phase)
        setFields(session.fields as FormField[])
        setAnswers((session.answers as AnswerCard[]).map(a => ({ ...a, copied: false })))
        setFieldCount(session.fieldCount)
        debug("FillForm", "Restored session, phase:", session.phase)
      }
    })
  }, [])

  const syncDraftState = useCallback(async (
    nextPhase: Phase,
    nextFields: FormField[],
    nextAnswers: AnswerCard[],
    nextFieldCount: number
  ) => {
    await setStorage("fillform_session", {
      phase: nextPhase,
      fields: nextFields,
      answers: nextAnswers.map(({ copied, ...answer }) => answer),
      fieldCount: nextFieldCount
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
      if (areaName !== "local" || !changes.active_job_context) return
      setActiveJobContext(normalizeActiveJobContext(changes.active_job_context.newValue))
    }

    chrome.storage.onChanged.addListener(handleStorageChange)
    return () => {
      mounted = false
      chrome.storage.onChanged.removeListener(handleStorageChange)
    }
  }, [])

  async function handleExtractForm() {
    setLoading(true)
    setError("")
    try {
      debug("FillForm", "Sending EXTRACT_FORM to content script...")
      const result: ExtractFormResponse = await sendToContentScript("EXTRACT_FORM")
      debug("FillForm", "EXTRACT_FORM response:", result)
      if (!result.success || result.fields.length === 0) {
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
    setLoading(true)
    setError("")
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
      debug("FillForm", "Calling fill-form with", fields.length, "fields")
      const result = await client.fillForm({
        form_fields: fields,
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
      setAnswers(cards)
      setPhase("answered")
      await syncDraftState("answered", fields, cards, fieldCount)
    } catch (err) {
      debugError("FillForm", "fill-form failed:", err)
      setError(err instanceof Error ? err.message : "Failed to generate answers")
    } finally {
      setLoading(false)
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
    syncDraftState("answered", fields, nextAnswers, fieldCount)
  }

  function handleReset() {
    setPhase("idle")
    setFields([])
    setAnswers([])
    setFieldCount(0)
    setError("")
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
              Generated answers stay local here. Use the Resume tab when you are ready to save the reviewed draft to the tracker.
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
              ? "You are editing answers for an existing saved job. These local changes are not in Supabase yet; save again from the Resume tab when ready."
              : activeJobContext?.persistence_state === "saved"
              ? "Saved to tracker. Any edits you make here will turn this back into an unsaved draft until you save again from the Resume tab."
              : "Local draft only. Edit these answers freely, then return to the Resume tab to save the reviewed draft to the tracker."}
          </div>
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
