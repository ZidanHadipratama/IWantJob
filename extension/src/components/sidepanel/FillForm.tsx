import type { ReactNode } from "react"
import { ClipboardList, Loader, AlertCircle, Copy, CheckCircle, Lock, RefreshCw, Save } from "lucide-react"
import type { ActiveJobContext } from "~lib/storage"
import { MAX_SOFT_FLAGGED_OVERRIDES, useFillFormController } from "./useFillFormController"

export default function FillForm() {
  const {
    phase,
    loading,
    error,
    personaText,
    fields,
    answers,
    autofillResults,
    autofillLoading,
    fieldCount,
    activeJobContext,
    savingDraft,
    saveTone,
    saveMessage,
    includedFlaggedFieldIds,
    isUnlocked,
    recoveredWithoutResumeContext,
    hasPersona,
    hasSavedJobWithLocalDraft,
    aiEligibleFields,
    softOverrideFields,
    skippedFields,
    fileFieldCount,
    selectedSoftOverrideCount,
    answerableFieldCount,
    needsBatchGeneration,
    autofillSummary,
    handleExtractForm,
    handleFillForm,
    handleCopy,
    handleCopyAll,
    handleAnswerChange,
    handleToggleFlaggedField,
    handleSaveDraft,
    handleAutofillForm,
    handleReset
  } = useFillFormController()

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

      {isUnlocked && (
        <div
          className={`rounded-lg border px-3 py-2 text-xs ${
            hasPersona
              ? "border-violet-100 bg-violet-50 text-violet-800"
              : "border-slate-200 bg-slate-50 text-slate-700"
          }`}>
          {hasPersona
            ? "Persona context is active. Generate Answers will use your saved persona together with the tailored resume and job description."
            : "No persona added. Generate Answers will use your tailored resume and job description only. Persona is optional in Settings."}
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

          {softOverrideFields.length > 0 && (
            <div className="space-y-2 rounded-lg border border-sky-100 bg-sky-50 px-3 py-3 text-xs text-sky-800">
              <p className="font-medium">
                Flagged AI overrides: {selectedSoftOverrideCount} of {MAX_SOFT_FLAGGED_OVERRIDES} selected
              </p>
              <p>
                You can include a small number of oversized choice fields in AI generation if they matter, but this may require batching and use more tokens.
              </p>
              <div className="space-y-1.5">
                {softOverrideFields.map((field) => {
                  const disableInclude =
                    !field.is_included && selectedSoftOverrideCount >= MAX_SOFT_FLAGGED_OVERRIDES

                  return (
                    <div key={`${field.field_id}-${field.label}`} className="rounded-md border border-sky-200/70 bg-white/80 px-2 py-2">
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <span className="block font-medium text-text-secondary">{field.label}</span>
                          <p className="text-[11px] text-sky-700">{field.ai_skip_reason}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleToggleFlaggedField(field.field_id)}
                          disabled={disableInclude}
                          className={`rounded-md px-2 py-1 text-[11px] font-medium ${
                            field.is_included
                              ? "bg-primary text-white"
                              : disableInclude
                                ? "cursor-not-allowed bg-slate-100 text-slate-400"
                                : "bg-white text-sky-800 ring-1 ring-sky-200"
                          }`}>
                          {field.is_included ? "Included" : "Include in AI"}
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {skippedFields.length > 0 && (
            <div className="space-y-2 rounded-lg border border-amber-100 bg-amber-50 px-3 py-3 text-xs text-amber-800">
              <p className="font-medium">
                {skippedFields.length} field{skippedFields.length === 1 ? "" : "s"} will need manual review before submission.
              </p>
              <div className="space-y-1.5">
                {skippedFields.map((field) => (
                  <div key={`${field.field_id}-${field.label}`} className="rounded-md border border-amber-200/70 bg-white/70 px-2 py-1.5">
                    <div className="flex items-start justify-between gap-3">
                      <span className="font-medium text-text-secondary">{field.label}</span>
                      <span className="font-mono text-[10px] uppercase tracking-wide text-amber-700">{field.type}</span>
                    </div>
                    <p className="mt-1 text-[11px]">{field.effective_skip_reason}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <button
            onClick={() => handleFillForm("single")}
            disabled={loading || !isUnlocked || needsBatchGeneration || answerableFieldCount === 0}
            className="btn-accent w-full flex items-center justify-center gap-2">
            {loading ? <Loader className="w-4 h-4 animate-spin" /> : <ClipboardList className="w-4 h-4" />}
            {!isUnlocked
              ? "Tailor Resume First"
              : answerableFieldCount === 0
                ? "Manual Fields Only"
                : needsBatchGeneration
                  ? "Single Pass Too Large"
              : loading
                ? "Generating Answers..."
                : "Generate Answers"}
          </button>

          {needsBatchGeneration && answerableFieldCount > 0 && (
            <button
              onClick={() => handleFillForm("batch")}
              disabled={loading || !isUnlocked}
              className="btn-secondary w-full flex items-center justify-center gap-2">
              {loading ? <Loader className="w-4 h-4 animate-spin" /> : <ClipboardList className="w-4 h-4" />}
              {loading ? "Generating..." : "Generate in Batches"}
            </button>
          )}

          {loading && (
            <p className="text-xs text-text-muted text-center">This may take a minute depending on your AI model...</p>
          )}
          {isUnlocked && (
            <p className="text-xs text-sky-700 text-center">
              Generated answers stay local here. {answerableFieldCount} field{answerableFieldCount === 1 ? "" : "s"} will be sent to AI, {skippedFields.length} field{skippedFields.length === 1 ? "" : "s"} require manual review, and any file upload fields are handled separately during autofill. {hasPersona ? "Your saved persona will also shape answer framing." : "Without persona, answers rely on resume + JD only."} Save to the tracker from this tab when your review is done.
            </p>
          )}
          {needsBatchGeneration && (
            <p className="text-xs text-amber-700 text-center">
              This form is still too large for one AI pass after the guardrails. `Generate in Batches` makes multiple requests and may use more tokens.
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
              ? "Saved to tracker. Any edits you make here will turn this back into an unsaved draft until you save again from this tab."
              : "Local draft only. Edit these answers freely, autofill if needed, then save to the tracker from this tab."}
          </div>

          <div
            className={`rounded-lg border px-3 py-2 text-xs ${
              hasPersona
                ? "border-violet-100 bg-violet-50 text-violet-800"
                : "border-slate-200 bg-slate-50 text-slate-700"
            }`}>
            {hasPersona
              ? "These answers were generated with persona context in addition to your tailored resume and the job description."
              : "These answers were generated without persona context. You can add one later in Settings if you want more personal framing."}
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
      message = `Unlocked. This application is already saved for ${role}${company}. New edits here stay local until you save again from this tab.`
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
