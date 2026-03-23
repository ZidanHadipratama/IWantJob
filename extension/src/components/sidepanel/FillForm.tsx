import { ClipboardList, Loader, AlertCircle, Copy, CheckCircle, Lock, RefreshCw, Save, User, ChevronDown, ChevronRight, ArrowRight } from "lucide-react"
import { readLogs } from "~lib/debug"
import { getEffectiveAiSkipReason, isSoftOverrideField, MAX_SOFT_FLAGGED_OVERRIDES, useFillFormController } from "./useFillFormController"
import type { FormFieldOption } from "~lib/types"

function normalizeChoice(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
}

function splitSelections(value: string): string[] {
  return value
    .split(/\n|,|;/)
    .map((part) => part.trim())
    .filter(Boolean)
}

function optionValue(option: FormFieldOption): string {
  return option.value || option.label
}

function optionMatchesSelection(option: FormFieldOption, currentValue: string): boolean {
  const normalizedOptionLabel = normalizeChoice(option.label)
  const normalizedOptionValue = normalizeChoice(option.value || "")

  return splitSelections(currentValue).some((selection) => {
    const normalizedSelection = normalizeChoice(selection)
    return normalizedSelection === normalizedOptionLabel || normalizedSelection === normalizedOptionValue
  })
}

function resolveOptionInputValue(options: FormFieldOption[], currentValue: string): string {
  const matched = options.find((option) => optionMatchesSelection(option, currentValue))
  return matched ? optionValue(matched) : currentValue
}

function toggleCheckboxSelection(currentValue: string, option: FormFieldOption, checked: boolean): string {
  const currentSelections = splitSelections(currentValue)
  const nextValue = optionValue(option)
  const filtered = currentSelections.filter((selection) => normalizeChoice(selection) !== normalizeChoice(nextValue))

  return checked ? [...filtered, nextValue].join(", ") : filtered.join(", ")
}

function detectFileFieldIntent(label: string): "resume" | "cover-letter" | "generic" {
  const normalized = label.toLowerCase()
  if (/\bcover letter\b|\bmotivation letter\b/.test(normalized)) return "cover-letter"
  if (/\bresume\b|\bcv\b|\bcurriculum vitae\b/.test(normalized)) return "resume"
  return "generic"
}

/* ── Inline sub-components ────────────────────────────────────── */

function StepPills({
  stepSummaries,
  currentPageIndex,
  onSelectStep
}: {
  stepSummaries: Array<{ pageIndex: number; fieldCount: number; answeredCount: number; isCurrent: boolean }>
  currentPageIndex: number
  onSelectStep: (pageIndex: number) => void
}) {
  return (
    <div className="flex items-center gap-1 overflow-x-auto pb-0.5">
      {stepSummaries.map((step, idx) => {
        const isComplete = step.answeredCount > 0 && step.answeredCount >= step.fieldCount
        const isCurrent = step.pageIndex === currentPageIndex
        return (
          <span key={step.pageIndex} className="flex items-center gap-1">
            {idx > 0 && <ChevronRight className="h-2.5 w-2.5 flex-shrink-0 text-slate-300" />}
            <button
              type="button"
              onClick={() => onSelectStep(step.pageIndex)}
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium whitespace-nowrap transition-colors ${
                isCurrent
                  ? "bg-primary-50 text-primary ring-1 ring-primary/20"
                  : isComplete
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-slate-100 text-slate-500 hover:bg-slate-200"
              }`}>
              {isComplete && !isCurrent && <CheckCircle className="h-2.5 w-2.5" />}
              <span>{step.fieldCount}f</span>
              {step.answeredCount > 0 && (
                <span className="text-[9px] opacity-70">{step.answeredCount}a</span>
              )}
            </button>
          </span>
        )
      })}
    </div>
  )
}

function SessionBar({
  currentPageIndex,
  totalScannedSteps,
  accumulatedAnswerCount,
  stepSummaries,
  onSelectStep
}: {
  currentPageIndex: number
  totalScannedSteps: number
  accumulatedAnswerCount: number
  stepSummaries: Array<{ pageIndex: number; fieldCount: number; answeredCount: number; isCurrent: boolean }>
  onSelectStep: (pageIndex: number) => void
}) {
  if (totalScannedSteps <= 1) return null

  return (
    <div className="space-y-1.5 rounded-lg border border-primary/10 bg-primary-50/40 px-3 py-2">
      <div className="flex items-center justify-between text-[11px] text-text-muted">
        <span className="font-medium text-text-secondary">
          Step {currentPageIndex} of {totalScannedSteps}
        </span>
        <span>{accumulatedAnswerCount} total answer{accumulatedAnswerCount === 1 ? "" : "s"}</span>
      </div>
      <StepPills
        stepSummaries={stepSummaries}
        currentPageIndex={currentPageIndex}
        onSelectStep={onSelectStep}
      />
      <p className="text-[10px] text-text-muted">Click a scanned step to reopen that page’s draft.</p>
    </div>
  )
}

function PriorContextPanel({
  priorAnswerCount,
  priorAnswerPreview
}: {
  priorAnswerCount: number
  priorAnswerPreview: Array<{ pageIndex: number; question: string; answer: string }>
}) {
  if (priorAnswerCount === 0) return null

  return (
    <details className="rounded-lg border border-slate-200 bg-slate-50 text-xs text-slate-700">
      <summary className="cursor-pointer select-none px-3 py-2 font-medium">
        AI context from other scanned steps: {priorAnswerCount} answer{priorAnswerCount === 1 ? "" : "s"}
      </summary>
      <div className="space-y-2 px-3 pb-3">
        {priorAnswerPreview.map((item, index) => (
          <div key={`${item.pageIndex}-${item.question}-${index}`} className="rounded-md border border-slate-200 bg-white px-2 py-2">
            <div className="mb-1 flex items-center gap-2">
              <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                Step {item.pageIndex}
              </span>
              <span className="truncate font-medium text-text-secondary">{item.question}</span>
            </div>
            <p className="text-[11px] text-slate-700 whitespace-pre-wrap">{item.answer}</p>
          </div>
        ))}
      </div>
    </details>
  )
}

export default function FillForm() {
  const {
    phase,
    loading,
    error,
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
    aiEligibleFields,
    softOverrideFields,
    skippedFields,
    fileFieldCount,
    selectedSoftOverrideCount,
    answerableFieldCount,
    selectedAiFieldCount,
    allScannedSelectedAiFieldCount,
    needsBatchGeneration,
    autofillSummary,
    currentPageIndex,
    totalScannedSteps,
    accumulatedAnswerCount,
    shouldPromptRescanCurrentPage,
    priorAnswerCount,
    priorAnswerPreview,
    stepSummaries,
    handleSelectStep,
    handleExtractForm,
    handleRescanCurrentPage,
    handlePrepareNextStep,
    handleFillForm,
    handleStartManualAnswers,
    handleFillAllScannedSteps,
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
  } = useFillFormController()

  const isMultiStep = totalScannedSteps > 1
  const visibleAnswerEntries = answers
    .map((answer, index) => ({ answer, index }))
    .filter(({ answer }) => !answer.removed)
  const removedAnswerEntries = answers
    .map((answer, index) => ({ answer, index }))
    .filter(({ answer }) => answer.removed)

  return (
    <div className="space-y-3">
      {/* ── Error banner ───────────────────────────────────────── */}
      {error && (
        <div className="rounded-lg bg-red-50 p-3 text-red-600">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <p className="text-sm">{error}</p>
          </div>
          <div className="mt-3 flex justify-end">
            <button
              onClick={async () => {
                const logs = await readLogs()
                await navigator.clipboard.writeText(logs.join("\n"))
              }}
              className="btn-secondary">
              <Copy className="h-4 w-4" />
              Copy Debug Logs
            </button>
          </div>
        </div>
      )}

      {/* ── Resume context warning ─────────────────────────────── */}
      {recoveredWithoutResumeContext && (
        <div className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Recovered draft is missing resume context. Re-open the Resume tab and tailor again before saving.
        </div>
      )}

      {/* ── Multi-step session bar (only when >1 step) ────────── */}
      {phase !== "idle" && (
        <SessionBar
          currentPageIndex={currentPageIndex}
          totalScannedSteps={totalScannedSteps}
          accumulatedAnswerCount={accumulatedAnswerCount}
          stepSummaries={stepSummaries}
          onSelectStep={(stepPageIndex) => void handleSelectStep(stepPageIndex)}
        />
      )}

      {/* ═══════════════════════════════════════════════════════════
          Phase: IDLE
          ═══════════════════════════════════════════════════════════ */}
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
              ? "Open a job application form, then scan the fields to generate AI answers."
              : "Tailor your resume first in the Resume tab to unlock form filling."}
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

      {/* ═══════════════════════════════════════════════════════════
          Phase: EXTRACTED
          ═══════════════════════════════════════════════════════════ */}
      {phase === "extracted" && (
        <>
          {/* Header row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-text">
                {fieldCount} Field{fieldCount === 1 ? "" : "s"} Found
              </h2>
              {isUnlocked && hasPersona && (
                <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-medium text-violet-700">
                  <User className="h-3 w-3" />
                  Persona
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleRescanCurrentPage}
                disabled={loading}
                className="text-xs text-text-muted hover:text-text flex items-center gap-1 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50">
                <RefreshCw className="w-3 h-3" /> Rescan
              </button>
              <button
                onClick={handleReset}
                disabled={loading}
                className="text-xs text-text-muted hover:text-text cursor-pointer disabled:cursor-not-allowed disabled:opacity-50">
                Reset
              </button>
            </div>
          </div>

          {/* Field list */}
          <div className="card p-3 space-y-1 max-h-48 overflow-y-auto">
            {fields.map((f, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <span className="text-text-muted font-mono w-16 flex-shrink-0">{f.type}</span>
                <span className="text-text-secondary truncate">{f.label}</span>
                {f.required && <span className="text-red-400 flex-shrink-0">*</span>}
              </div>
            ))}
          </div>

          {/* Flagged overrides (collapsible) */}
          {softOverrideFields.length > 0 && (
            <details className="rounded-lg border border-sky-100 bg-sky-50 text-xs text-sky-800">
              <summary className="flex cursor-pointer items-center gap-1 px-3 py-2 font-medium select-none">
                <ChevronDown className="h-3 w-3 transition-transform [[open]>&]:rotate-0 [&:not([open])>&]:-rotate-90" />
                Flagged overrides: {selectedSoftOverrideCount}/{MAX_SOFT_FLAGGED_OVERRIDES} selected
              </summary>
              <div className="space-y-1.5 px-3 pb-3">
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
                          {field.is_included ? "Included" : "Include"}
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </details>
          )}

          {/* Skipped fields (collapsible) */}
          {skippedFields.length > 0 && (
            <details className="rounded-lg border border-amber-100 bg-amber-50 text-xs text-amber-800">
              <summary className="flex cursor-pointer items-center gap-1 px-3 py-2 font-medium select-none">
                <ChevronDown className="h-3 w-3 transition-transform [[open]>&]:rotate-0 [&:not([open])>&]:-rotate-90" />
                {skippedFields.length} field{skippedFields.length === 1 ? "" : "s"} need manual review
              </summary>
              <div className="space-y-1.5 px-3 pb-3">
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
            </details>
          )}

          <PriorContextPanel
            priorAnswerCount={priorAnswerCount}
            priorAnswerPreview={priorAnswerPreview}
          />

          {/* ── Action buttons ─────────────────────────────────── */}
          <div className="space-y-2">
            <button
              onClick={() => handleFillForm("single")}
              disabled={loading || !isUnlocked || needsBatchGeneration || answerableFieldCount === 0}
              className="btn-accent w-full flex items-center justify-center gap-2">
              {loading ? <Loader className="w-4 h-4 animate-spin" /> : <ClipboardList className="w-4 h-4" />}
              {!isUnlocked
                ? "Tailor Resume First"
                : answerableFieldCount === 0
                  ? "No AI-Eligible Fields"
                  : needsBatchGeneration
                    ? "Use Batch Mode Below"
                    : loading
                      ? "Generating..."
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

            <button
              onClick={() => void handleStartManualAnswers()}
              disabled={loading || !isUnlocked}
              className="btn-secondary w-full flex items-center justify-center gap-2">
              Answer Manually
            </button>
          </div>

          {/* Field stats footer */}
          <p className="text-[11px] text-text-muted text-center">
            {isUnlocked
              ? `${answerableFieldCount} AI-eligible · ${skippedFields.length} manual · ${fileFieldCount} upload`
              : "Tailor your resume to unlock AI generation."}
          </p>
        </>
      )}

      {/* ═══════════════════════════════════════════════════════════
          Phase: ANSWERED
          ═══════════════════════════════════════════════════════════ */}
      {phase === "answered" && (
        <>
          {/* Header row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-600" />
              <h2 className="text-sm font-semibold text-text">
                {visibleAnswerEntries.length} Active Question{visibleAnswerEntries.length === 1 ? "" : "s"}
              </h2>
              {hasPersona && (
                <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-medium text-violet-700">
                  <User className="h-3 w-3" />
                  Persona
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button onClick={handleCopyAll} className="text-xs text-primary hover:text-primary-700 font-medium cursor-pointer">
                Copy All
              </button>
              <button onClick={handleReset} className="text-xs text-text-muted hover:text-text cursor-pointer">
                Reset
              </button>
            </div>
          </div>

          {/* ── Page-scoped actions ────────────────────────────── */}
          <div className="space-y-2 rounded-lg border border-border bg-white p-3">
            <button
              onClick={() => handleFillForm(needsBatchGeneration ? "batch" : "single")}
              disabled={loading || !isUnlocked || selectedAiFieldCount === 0}
              className="btn-accent w-full flex items-center justify-center gap-2">
              {loading ? <Loader className="w-4 h-4 animate-spin" /> : <ClipboardList className="w-4 h-4" />}
              {!isUnlocked
                ? "Tailor Resume First"
                : selectedAiFieldCount === 0
                  ? "No Questions Selected for AI"
                  : loading
                    ? "Generating..."
                    : needsBatchGeneration
                      ? "Generate Selected with AI (Batch)"
                      : "Generate Selected with AI"}
            </button>

            {isMultiStep && (
              <button
                onClick={() => void handleFillAllScannedSteps()}
                disabled={loading || !isUnlocked || allScannedSelectedAiFieldCount === 0}
                className="btn-secondary w-full flex items-center justify-center gap-2">
                {loading ? <Loader className="w-4 h-4 animate-spin" /> : <ClipboardList className="w-4 h-4" />}
                {loading ? "Generating..." : `Generate All Scanned Steps (${allScannedSelectedAiFieldCount})`}
              </button>
            )}

            <button
              onClick={handleAutofillForm}
              disabled={autofillLoading || visibleAnswerEntries.length === 0}
              className="btn-accent w-full flex items-center justify-center gap-2">
              {autofillLoading ? <Loader className="w-4 h-4 animate-spin" /> : <ClipboardList className="w-4 h-4" />}
              {autofillLoading ? "Autofilling..." : "Autofill This Page"}
            </button>

            {shouldPromptRescanCurrentPage && (
              <button
                onClick={handleRescanCurrentPage}
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-medium text-sky-800 hover:bg-sky-100 transition-colors cursor-pointer">
                <RefreshCw className="w-3 h-3" />
                New questions appeared? Rescan this page
              </button>
            )}

            <p className="text-[11px] text-center text-text-muted">
              {selectedAiFieldCount} selected for this step · {answerableFieldCount} AI-eligible total · {fileFieldCount} upload
            </p>
          </div>

          <PriorContextPanel
            priorAnswerCount={priorAnswerCount}
            priorAnswerPreview={priorAnswerPreview}
          />

          {removedAnswerEntries.length > 0 && (
            <details className="rounded-lg border border-slate-200 bg-slate-50 text-xs text-slate-700">
              <summary className="cursor-pointer select-none px-3 py-2 font-medium">
                Removed Questions: {removedAnswerEntries.length}
              </summary>
              <div className="space-y-2 px-3 pb-3">
                {removedAnswerEntries.map(({ answer }) => (
                  <div key={`removed-${answer.field_id}`} className="flex items-start justify-between gap-3 rounded-md border border-slate-200 bg-white px-3 py-2">
                    <div>
                      <p className="text-sm font-medium text-text-secondary">{answer.label}</p>
                      {answer.answer && (
                        <p className="mt-1 text-[11px] text-text-muted">Previous draft kept locally: {answer.answer}</p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleRestoreQuestion(answer.field_id)}
                      className="rounded-lg border border-border bg-white px-2 py-1 text-[11px] font-medium text-text-secondary hover:bg-slate-100">
                      Restore
                    </button>
                  </div>
                ))}
              </div>
            </details>
          )}

          {/* ── Autofill results (if any) ──────────────────────── */}
          {autofillResults.length > 0 && (
            <div className="space-y-2">
              <div className={`rounded-lg border px-3 py-2 text-xs ${autofillSummary.toneClass}`}>
                <div className="flex items-center justify-between">
                  <span>{autofillSummary.message}</span>
                  <span className="font-mono text-[10px]">
                    {autofillSummary.filled}/{autofillResults.length}
                  </span>
                </div>
                {autofillSummary.hasFileIssue && (
                  <p className="mt-1">
                    Download the tailored PDF from the Resume tab and upload it manually.
                  </p>
                )}
              </div>
              <details className="text-xs">
                <summary className="cursor-pointer text-text-muted hover:text-text select-none py-1">
                  Field-by-field results
                </summary>
                <div className="space-y-1 pt-1">
                  {autofillResults.map((result) => (
                    <div
                      key={`${result.field_id}-${result.label}`}
                      className={`rounded-md border px-2 py-1.5 ${
                        result.status === "filled"
                          ? "border-emerald-100 bg-emerald-50 text-emerald-800"
                          : result.status === "skipped"
                            ? "border-amber-100 bg-amber-50 text-amber-800"
                            : "border-red-100 bg-red-50 text-red-700"
                      }`}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate">{result.label}</span>
                        <span className="font-mono text-[10px] uppercase flex-shrink-0">{result.status}</span>
                      </div>
                      {result.reason && (
                        <p className="mt-0.5 text-[11px] opacity-80">{result.reason}</p>
                      )}
                    </div>
                  ))}
                </div>
              </details>
            </div>
          )}

          {/* ── Continue / Save actions ────────────────────────── */}
          <div className="flex gap-2">
            <button
              onClick={handlePrepareNextStep}
              disabled={loading}
              className="btn-secondary flex-1 flex items-center justify-center gap-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-60">
              <ArrowRight className="w-3.5 h-3.5" />
              Scan Next Step
            </button>
            <button
              onClick={handleSaveDraft}
              disabled={savingDraft || !isUnlocked}
              className="btn-primary flex-1 flex items-center justify-center gap-1.5 text-xs">
              {savingDraft ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              {savingDraft
                ? "Saving..."
                : activeJobContext?.persistence_state === "saved"
                  ? "Update Tracker"
                  : "Save to Tracker"}
            </button>
          </div>

          {isMultiStep && (
            <div className="space-y-1">
              <p className="text-[11px] text-text-muted text-center">
                Navigate to the next page on the site, then scan. Saving includes all steps, and you can reopen older steps from the step pills above.
              </p>
            </div>
          )}

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

          {/* ── Answer cards ───────────────────────────────────── */}
          <div className="space-y-2">
            {visibleAnswerEntries.map(({ answer: a, index: idx }) => (
              <div key={a.field_id || idx} className="card p-3 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-text">{a.label}</p>
                    {(() => {
                      const field = fields.find((item) => item.field_id === a.field_id)
                      const effectiveSkipReason = field ? getEffectiveAiSkipReason(field, includedFlaggedFieldIds) : null
                      const isSoftOverride = field ? isSoftOverrideField(field) : false
                      const aiDisabled = !field || (Boolean(effectiveSkipReason) && !isSoftOverride)

                      return (
                        <div className="flex flex-wrap items-center gap-3 text-[11px] text-text-muted">
                          <label className={`inline-flex items-center gap-2 ${aiDisabled ? "opacity-60" : ""}`}>
                            <input
                              type="checkbox"
                              checked={a.ai_selected !== false}
                              disabled={aiDisabled}
                              onChange={(event) => handleToggleAiSelection(idx, event.target.checked)}
                            />
                            <span>Use AI</span>
                          </label>
                          {effectiveSkipReason && (
                            <span className={isSoftOverride ? "text-sky-700" : "text-amber-700"}>
                              {isSoftOverride
                                ? `Optional override (${selectedSoftOverrideCount}/${MAX_SOFT_FLAGGED_OVERRIDES}): ${field?.ai_skip_reason}`
                                : effectiveSkipReason}
                            </span>
                          )}
                        </div>
                      )
                    })()}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleCopy(idx)}
                      className="flex-shrink-0 text-text-muted hover:text-primary cursor-pointer"
                      title="Copy answer">
                      {a.copied
                        ? <CheckCircle className="w-3.5 h-3.5 text-green-600" />
                        : <Copy className="w-3.5 h-3.5" />
                      }
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleRemoveQuestion(idx)}
                      className="text-[11px] font-medium text-text-muted hover:text-text">
                      Remove
                    </button>
                  </div>
                </div>
                {(() => {
                  const field = fields.find((item) => item.field_id === a.field_id)
                  const options = field?.options || []
                  const fileIntent = detectFileFieldIntent(a.label)

                  if (a.field_type === "textarea") {
                    return (
                      <textarea
                        value={a.answer}
                        onChange={(event) => handleAnswerChange(idx, event.target.value)}
                        rows={5}
                        className="min-h-[112px] w-full resize-y rounded-lg border border-border bg-white px-3 py-2 text-sm text-text-secondary outline-none transition focus:border-primary"
                      />
                    )
                  }

                  if (a.field_type === "text") {
                    return (
                      <input
                        value={a.answer}
                        onChange={(event) => handleAnswerChange(idx, event.target.value)}
                        className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-text-secondary outline-none transition focus:border-primary"
                      />
                    )
                  }

                  if ((a.field_type === "select" || a.field_type === "combobox" || a.field_type === "radio") && options.length > 0) {
                    return (
                      <select
                        value={resolveOptionInputValue(options, a.answer)}
                        onChange={(event) => handleAnswerChange(idx, event.target.value)}
                        className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-text-secondary outline-none transition focus:border-primary">
                        <option value="">{a.field_type === "radio" ? "Select an option" : "Choose an option"}</option>
                        {options.map((option) => (
                          <option key={`${a.field_id}-${optionValue(option)}`} value={optionValue(option)}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    )
                  }

                  if (a.field_type === "combobox") {
                    return (
                      <input
                        value={a.answer}
                        onChange={(event) => handleAnswerChange(idx, event.target.value)}
                        className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-text-secondary outline-none transition focus:border-primary"
                      />
                    )
                  }

                  if (a.field_type === "checkbox") {
                    if (options.length > 1) {
                      return (
                        <div className="space-y-2 rounded-lg border border-border bg-slate-50 p-3">
                          {options.map((option) => {
                            const checked = optionMatchesSelection(option, a.answer)
                            return (
                              <label key={`${a.field_id}-${optionValue(option)}`} className="flex cursor-pointer items-center gap-2 text-sm text-text-secondary">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={(event) => handleAnswerChange(idx, toggleCheckboxSelection(a.answer, option, event.target.checked))}
                                />
                                <span>{option.label}</span>
                              </label>
                            )
                          })}
                        </div>
                      )
                    }

                    const checked = ["yes", "true", "checked", "selected", "on"].includes(normalizeChoice(a.answer))
                    return (
                      <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-slate-50 px-3 py-2 text-sm text-text-secondary">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(event) => handleAnswerChange(idx, event.target.checked ? "Yes" : "No")}
                        />
                        <span>{checked ? "Checked" : "Unchecked"}</span>
                      </label>
                    )
                  }

                  if (a.field_type === "file") {
                    const hasCoverLetter = Boolean(activeJobContext?.cover_letter_text?.trim())
                    const hasTailoredResume = Boolean(activeJobContext?.tailored_resume_json)

                    return (
                      <div className="space-y-3 rounded-lg border border-border bg-slate-50 p-3">
                        <div className="space-y-1">
                          <p className="text-[11px] font-medium uppercase tracking-wide text-text-muted">Upload Source</p>
                          {a.answer ? (
                            <p className="text-sm text-text-secondary">Selected file: {a.answer}</p>
                          ) : (
                            <p className="text-sm text-text-muted">No file selected yet.</p>
                          )}
                        </div>

                        <div className="flex flex-wrap gap-2">
                          {fileIntent === "resume" && (
                            <button
                              type="button"
                              onClick={() => void handleUseGeneratedFile(idx, "tailored-resume")}
                              disabled={!hasTailoredResume}
                              className="rounded-lg border border-primary/20 bg-primary-50 px-3 py-2 text-xs font-medium text-primary disabled:cursor-not-allowed disabled:opacity-50">
                              Use Tailored Resume
                            </button>
                          )}

                          {fileIntent === "cover-letter" && (
                            <button
                              type="button"
                              onClick={() => void handleUseGeneratedFile(idx, "cover-letter")}
                              disabled={!hasCoverLetter}
                              className="rounded-lg border border-primary/20 bg-primary-50 px-3 py-2 text-xs font-medium text-primary disabled:cursor-not-allowed disabled:opacity-50">
                              Use Cover Letter
                            </button>
                          )}

                          <label className="cursor-pointer rounded-lg border border-border bg-white px-3 py-2 text-xs font-medium text-text-secondary hover:bg-slate-100">
                            Choose Local File
                            <input
                              type="file"
                              className="hidden"
                              onChange={(event) => {
                                const file = event.target.files?.[0] || null
                                void handleUploadLocalFile(idx, file)
                                event.currentTarget.value = ""
                              }}
                            />
                          </label>

                          {a.answer && (
                            <button
                              type="button"
                              onClick={() => void handleClearFileSelection(idx)}
                              className="rounded-lg border border-border bg-white px-3 py-2 text-xs font-medium text-text-secondary hover:bg-slate-100">
                              Clear
                            </button>
                          )}
                        </div>

                        {fileIntent === "resume" && !hasTailoredResume && (
                          <p className="text-[11px] text-amber-700">Tailor the resume first to unlock direct resume upload for this field.</p>
                        )}
                        {fileIntent === "cover-letter" && !hasCoverLetter && (
                          <p className="text-[11px] text-amber-700">Create a cover letter first, or choose a local file manually.</p>
                        )}
                        {fileIntent === "generic" && (
                          <p className="text-[11px] text-text-muted">This upload field does not look like resume or cover-letter input, so local upload stays manual.</p>
                        )}
                      </div>
                    )
                  }

                  return (
                    <textarea
                      value={a.answer}
                      onChange={(event) => handleAnswerChange(idx, event.target.value)}
                      rows={3}
                      className="min-h-[88px] w-full resize-y rounded-lg border border-border bg-white px-3 py-2 text-sm text-text-secondary outline-none transition focus:border-primary"
                    />
                  )
                })()}
              </div>
            ))}
            {visibleAnswerEntries.length === 0 && (
              <div className="rounded-lg border border-dashed border-border bg-slate-50 px-4 py-6 text-center text-sm text-text-muted">
                No active questions remain on this step. Restore a removed question or scan another step.
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
