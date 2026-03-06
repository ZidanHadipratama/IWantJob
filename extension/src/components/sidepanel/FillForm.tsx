import { useState, useEffect, useCallback } from "react"
import { ClipboardList, Loader, AlertCircle, Copy, CheckCircle, RefreshCw } from "lucide-react"
import { createApiClient } from "~lib/api"
import { getStorage, setStorage } from "~lib/storage"
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

  // Restore session on mount
  useEffect(() => {
    debug("FillForm", "Component mounted")
    getStorage("fillform_session").then(session => {
      if (session && session.phase !== "idle") {
        setPhase(session.phase as Phase)
        setFields(session.fields as FormField[])
        setAnswers((session.answers as AnswerCard[]).map(a => ({ ...a, copied: false })))
        setFieldCount(session.fieldCount)
        debug("FillForm", "Restored session, phase:", session.phase)
      }
    })
  }, [])

  const saveSession = useCallback((p: Phase, f: FormField[], a: AnswerCard[], fc: number) => {
    setStorage("fillform_session", { phase: p, fields: f, answers: a, fieldCount: fc })
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
      saveSession("extracted", result.fields, [], result.fields.length)
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
      const resumeJson = await getStorage("base_resume_json")
      if (!resumeJson) {
        setError("No resume found. Go to Settings and add your base resume first.")
        return
      }

      const client = await createApiClient()
      debug("FillForm", "Calling fill-form with", fields.length, "fields")
      const result = await client.fillForm({
        form_fields: fields,
        resume_json: resumeJson,
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
      saveSession("answered", fields, cards, fieldCount)
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

  function handleReset() {
    setPhase("idle")
    setFields([])
    setAnswers([])
    setFieldCount(0)
    setError("")
    setStorage("fillform_session", null)
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="flex items-start gap-2 text-red-600 bg-red-50 rounded-lg p-3">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <p className="text-sm">{error}</p>
        </div>
      )}

      {/* Phase: Idle */}
      {phase === "idle" && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="w-12 h-12 rounded-xl bg-primary-50 flex items-center justify-center mb-4">
            <ClipboardList className="w-6 h-6 text-primary" />
          </div>
          <h2 className="text-lg font-semibold text-text mb-2">Form Assistant</h2>
          <p className="text-sm text-text-muted max-w-[280px] mb-6">
            Open a job application form, then click below to extract the fields and generate AI answers.
          </p>
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
            disabled={loading}
            className="btn-accent w-full flex items-center justify-center gap-2">
            {loading ? <Loader className="w-4 h-4 animate-spin" /> : <ClipboardList className="w-4 h-4" />}
            {loading ? "Generating Answers..." : "Generate Answers"}
          </button>

          {loading && (
            <p className="text-xs text-text-muted text-center">This may take a minute depending on your AI model...</p>
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
                <p className="text-sm text-text-secondary whitespace-pre-wrap">{a.answer}</p>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
