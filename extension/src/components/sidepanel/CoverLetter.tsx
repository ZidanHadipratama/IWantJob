import { AlertCircle, CheckCircle, Copy, Download, Loader, RefreshCw, ScrollText, Sparkles } from "lucide-react"

import { OUTPUT_LANGUAGE_OPTIONS } from "~lib/output-language"
import { useResumeController } from "./useResumeController"

export default function CoverLetter() {
  const {
    phase,
    error,
    company,
    jobTitle,
    coverLetterText,
    coverLetterLoading,
    coverLetterCopied,
    outputLanguage,
    saveMessage,
    saveTone,
    metadataWarning,
    handleGenerateCoverLetter,
    handleCoverLetterChange,
    handleCopyCoverLetter,
    handleDownloadCoverLetter,
    handleOutputLanguageChange,
    handleReset,
    handleContinueToFillForm
  } = useResumeController()

  if (phase !== "tailored") {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary-50">
          <ScrollText className="h-6 w-6 text-primary" />
        </div>
        <h2 className="mb-2 text-lg font-semibold text-text">Cover Letter</h2>
        <p className="mb-6 max-w-[280px] text-sm text-text-muted">
          Tailor your resume first in the Resume tab, then come back here to write or generate a cover letter.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-red-50 p-3 text-red-600">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <p className="text-sm">{error}</p>
        </div>
      )}

      {saveMessage && saveTone === "neutral" && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-100 bg-amber-50 p-3 text-amber-800">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <p className="text-sm">{saveMessage}</p>
        </div>
      )}

      {metadataWarning && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-100 bg-amber-50 p-3 text-amber-800">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <p className="text-sm">{metadataWarning}</p>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ScrollText className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold text-text">Cover Letter</h2>
        </div>
        <button onClick={handleReset} className="flex cursor-pointer items-center gap-1 text-xs text-text-muted hover:text-text">
          <RefreshCw className="h-3 w-3" /> New Job
        </button>
      </div>

      {(company || jobTitle) && (
        <div className="card p-3">
          {jobTitle && <p className="text-sm font-semibold text-text">{jobTitle}</p>}
          {company && <p className="text-xs text-text-muted">{company}</p>}
        </div>
      )}

      <div className="card p-4 space-y-3">
        <div>
          <label className="label mb-2 block">Output Language</label>
          <select
            value={outputLanguage}
            onChange={(event) => void handleOutputLanguageChange(event.target.value)}
            className="input-field">
            {OUTPUT_LANGUAGE_OPTIONS.map((language) => (
              <option key={language} value={language}>
                {language}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleGenerateCoverLetter}
            disabled={coverLetterLoading}
            className="btn-accent flex-1 items-center justify-center gap-2">
            {coverLetterLoading ? <Loader className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {coverLetterLoading ? "Generating..." : "Generate with AI"}
          </button>
          <button
            onClick={handleContinueToFillForm}
            className="btn-primary flex-1 items-center justify-center gap-2">
            <CheckCircle className="h-4 w-4" />
            Continue to Fill Form
          </button>
        </div>

        <textarea
          value={coverLetterText}
          onChange={(event) => handleCoverLetterChange(event.target.value)}
          rows={14}
          placeholder="Write your cover letter here, or use Generate with AI to draft one from your tailored resume and the job description."
          className="min-h-[280px] w-full resize-y rounded-lg border border-border bg-white px-3 py-3 text-sm text-text-secondary outline-none transition focus:border-primary"
        />

        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleCopyCoverLetter}
            disabled={!coverLetterText.trim()}
            className="btn-primary flex-1 items-center justify-center gap-2">
            {coverLetterCopied ? <CheckCircle className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {coverLetterCopied ? "Copied!" : "Copy Cover Letter"}
          </button>
          <button
            onClick={handleDownloadCoverLetter}
            disabled={!coverLetterText.trim()}
            className="btn-secondary flex-1 items-center justify-center gap-2">
            <Download className="h-4 w-4" />
            Download .txt
          </button>
        </div>
      </div>
    </div>
  )
}
