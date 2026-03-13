import { useState, type ReactNode } from "react"
import { FileText, Download, Loader, AlertCircle, CheckCircle, Copy, RefreshCw, ChevronDown, ChevronRight, Pencil, X, Plus, Trash2 } from "lucide-react"
import type { ResumeContact, ResumeJson, ResumeSkills } from "~lib/types"
import { useResumeController } from "./useResumeController"

export default function Resume() {
  const {
    phase,
    loading,
    downloading,
    error,
    jdText,
    company,
    jobTitle,
    tailoredJson,
    matchScore,
    copied,
    persistenceState,
    saveTone,
    saveMessage,
    hasLocalEditsOnSavedJob,
    metadataWarning,
    handleExtractJD,
    handleTailor,
    handleCopy,
    handleDownloadPdf,
    handleResumeChange,
    handleReset,
    handleContinueToFillForm
  } = useResumeController()

  return (
    <div className="space-y-4">
      {error && (
        <div className="flex items-start gap-2 text-red-600 bg-red-50 rounded-lg p-3">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <p className="text-sm">{error}</p>
        </div>
      )}

      {saveMessage && saveTone === "neutral" && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-100 bg-amber-50 p-3 text-amber-800">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <p className="text-sm">{saveMessage}</p>
        </div>
      )}

      {metadataWarning && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-100 bg-amber-50 p-3 text-amber-800">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <p className="text-sm">{metadataWarning}</p>
        </div>
      )}

      {phase === "idle" && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="w-12 h-12 rounded-xl bg-primary-50 flex items-center justify-center mb-4">
            <FileText className="w-6 h-6 text-primary" />
          </div>
          <h2 className="text-lg font-semibold text-text mb-2">Resume Tailoring</h2>
          <p className="text-sm text-text-muted max-w-[280px] mb-6">
            Open a job description page, then click below to extract it and tailor your resume.
          </p>
          <button onClick={handleExtractJD} disabled={loading}
            className="btn-primary flex items-center gap-2">
            {loading ? <Loader className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
            {loading ? "Extracting..." : "Get Job Description"}
          </button>
        </div>
      )}

      {phase === "extracted" && (
        <>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-text">Job Description Extracted</h2>
            <button onClick={handleReset} className="text-xs text-text-muted hover:text-text flex items-center gap-1 cursor-pointer">
              <RefreshCw className="w-3 h-3" /> New Job
            </button>
          </div>
          {(company || jobTitle) && (
            <div className="card p-3">
              {jobTitle && <p className="text-sm font-semibold text-text">{jobTitle}</p>}
              {company && <p className="text-xs text-text-muted">{company}</p>}
            </div>
          )}
          <div className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            This is still a local draft. Nothing will be saved to your tracker until the explicit save step.
          </div>
          <div className="card p-3 max-h-48 overflow-y-auto">
            <p className="text-xs text-text-secondary whitespace-pre-wrap">{jdText}</p>
          </div>
          <button onClick={handleTailor} disabled={loading}
            className="btn-accent w-full flex items-center justify-center gap-2">
            {loading ? <Loader className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
            {loading ? "Tailoring Resume..." : "Tailor Resume"}
          </button>
          {loading && (
            <p className="text-xs text-text-muted text-center">This may take a minute depending on your AI model...</p>
          )}
        </>
      )}

      {phase === "tailored" && tailoredJson && (
        <>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-600" />
              <h2 className="text-sm font-semibold text-text">Resume Tailored</h2>
            </div>
            <button onClick={handleReset} className="text-xs text-text-muted hover:text-text flex items-center gap-1 cursor-pointer">
              <RefreshCw className="w-3 h-3" /> New Job
            </button>
          </div>
          {matchScore > 0 && (
            <div className="card p-3 flex items-center justify-between">
              <span className="text-xs text-text-muted">Match Score</span>
              <span className={`text-sm font-bold ${matchScore >= 80 ? "text-green-600" : matchScore >= 60 ? "text-yellow-600" : "text-red-500"}`}>
                {matchScore}%
              </span>
            </div>
          )}
          {(company || jobTitle) && (
            <div className="card p-3">
              {jobTitle && <p className="text-sm font-semibold text-text">{jobTitle}</p>}
              {company && <p className="text-xs text-text-muted">{company}</p>}
            </div>
          )}
          <div className="rounded-lg border border-sky-100 bg-sky-50 px-3 py-2 text-xs text-sky-800">
            {hasLocalEditsOnSavedJob
              ? "Recovered a saved application with new local edits. Save again to sync these changes back to the tracker."
              : persistenceState === "saved"
              ? "Saved to tracker. Any new edits here or in Fill Form will switch this back to an unsaved draft."
              : "Unsaved draft. Review and edit this resume now; the tracker stays unchanged until you explicitly save later."}
          </div>
          <div className="card p-3 max-h-96 overflow-y-auto space-y-3">
            <ResumePreview resume={tailoredJson} onChange={handleResumeChange} />
          </div>
          <p className="text-xs text-text-muted text-center">Click any text to edit before downloading</p>
          <button
            onClick={handleContinueToFillForm}
            className="btn-primary w-full flex items-center justify-center gap-2">
            <CheckCircle className="w-4 h-4" />
            Continue to Fill Form
          </button>
          <p className="text-xs text-text-muted text-center">
            Review answers, autofill the page, and save to the tracker from the Fill Form tab.
          </p>
          <div className="flex gap-2">
            <button onClick={handleCopy}
              className="btn-primary flex-1 flex items-center justify-center gap-2">
              {copied ? <CheckCircle className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copied ? "Copied!" : "Copy Text"}
            </button>
            <button onClick={handleDownloadPdf} disabled={downloading}
              className="btn-accent flex-1 flex items-center justify-center gap-2">
              {downloading ? <Loader className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              {downloading ? "Generating..." : "Download PDF"}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

function CollapsibleSection({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(true)
  return (
    <div>
      <button onClick={() => setOpen(!open)}
        className="flex items-center gap-1 w-full text-left cursor-pointer">
        {open ? <ChevronDown className="w-3 h-3 text-text-muted" /> : <ChevronRight className="w-3 h-3 text-text-muted" />}
        <span className="text-xs font-bold text-text uppercase tracking-wide">{title}</span>
      </button>
      {open && <div className="mt-1 ml-4">{children}</div>}
    </div>
  )
}

function EditableText({ value, onChange, className, placeholder }: {
  value: string; onChange: (v: string) => void; className?: string; placeholder?: string
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={e => onChange(e.target.value)}
      className={`bg-transparent border-b border-transparent hover:border-border focus:border-primary focus:outline-none ${className || ""}`}
      placeholder={placeholder}
    />
  )
}

function EditableTextarea({ value, onChange, className }: {
  value: string; onChange: (v: string) => void; className?: string
}) {
  return (
    <textarea
      value={value}
      onChange={e => onChange(e.target.value)}
      rows={2}
      className={`bg-transparent border border-transparent hover:border-border focus:border-primary focus:outline-none w-full resize-none ${className || ""}`}
    />
  )
}

function ResumePreview({ resume, onChange }: { resume: ResumeJson; onChange: (r: ResumeJson) => void }) {
  const c = resume.contact

  function updateContact(field: keyof ResumeContact, value: string) {
    onChange({ ...resume, contact: { ...resume.contact, [field]: value } })
  }

  function updateSummary(value: string) {
    onChange({ ...resume, summary: value })
  }

  function updateSkills(cat: "languages" | "frameworks" | "tools" | "other", value: string) {
    const items = value.split(",").map(s => s.trim()).filter(Boolean)
    onChange({ ...resume, skills: { ...resume.skills, [cat]: items.length ? items : undefined } })
  }

  function updateEntry(secIdx: number, entIdx: number, field: string, value: string) {
    const sections = resume.sections.map((sec, si) => {
      if (si !== secIdx) return sec
      const entries = sec.entries.map((ent, ei) => {
        if (ei !== entIdx) return ent
        return { ...ent, [field]: value }
      })
      return { ...sec, entries }
    })
    onChange({ ...resume, sections })
  }

  function updateBullet(secIdx: number, entIdx: number, bulIdx: number, value: string) {
    const sections = resume.sections.map((sec, si) => {
      if (si !== secIdx) return sec
      const entries = sec.entries.map((ent, ei) => {
        if (ei !== entIdx) return ent
        const bullets = ent.bullets.map((b, bi) => bi === bulIdx ? value : b)
        return { ...ent, bullets }
      })
      return { ...sec, entries }
    })
    onChange({ ...resume, sections })
  }

  function removeBullet(secIdx: number, entIdx: number, bulIdx: number) {
    const sections = resume.sections.map((sec, si) => {
      if (si !== secIdx) return sec
      const entries = sec.entries.map((ent, ei) => {
        if (ei !== entIdx) return ent
        return { ...ent, bullets: ent.bullets.filter((_, bi) => bi !== bulIdx) }
      })
      return { ...sec, entries }
    })
    onChange({ ...resume, sections })
  }

  function addBullet(secIdx: number, entIdx: number) {
    const sections = resume.sections.map((sec, si) => {
      if (si !== secIdx) return sec
      const entries = sec.entries.map((ent, ei) => {
        if (ei !== entIdx) return ent
        return { ...ent, bullets: [...ent.bullets, ""] }
      })
      return { ...sec, entries }
    })
    onChange({ ...resume, sections })
  }

  return (
    <>
      <div className="text-center space-y-0.5">
        <EditableText value={c.name || ""} onChange={v => updateContact("name", v)}
          className="w-full text-sm font-bold text-text text-center" placeholder="Name" />
        <div className="flex gap-1 justify-center flex-wrap">
          <EditableText value={c.email || ""} onChange={v => updateContact("email", v)}
            className="text-xs text-text-muted text-center w-auto max-w-[140px]" placeholder="Email" />
          <EditableText value={c.phone || ""} onChange={v => updateContact("phone", v)}
            className="text-xs text-text-muted text-center w-auto max-w-[100px]" placeholder="Phone" />
          <EditableText value={c.location || ""} onChange={v => updateContact("location", v)}
            className="text-xs text-text-muted text-center w-auto max-w-[120px]" placeholder="Location" />
        </div>
      </div>

      {resume.summary != null && (
        <CollapsibleSection title="Summary">
          <EditableTextarea value={resume.summary || ""} onChange={updateSummary}
            className="text-xs text-text-secondary" />
        </CollapsibleSection>
      )}

      {resume.skills && (
        <CollapsibleSection title="Skills">
          {([
            ["languages", "Languages", resume.skills.languages],
            ["frameworks", "Frameworks", resume.skills.frameworks],
            ["tools", "Tools", resume.skills.tools],
            ["other", "Other", resume.skills.other],
          ] as [keyof ResumeSkills, string, string[] | undefined][])
            .filter(([, , v]) => v?.length)
            .map(([key, label, vals]) => (
              <div key={key} className="flex items-baseline gap-1">
                <span className="text-xs font-semibold text-text-secondary flex-shrink-0">{label}:</span>
                <EditableText value={vals!.join(", ")} onChange={v => updateSkills(key, v)}
                  className="flex-1 min-w-0 text-xs text-text-secondary" />
              </div>
            ))}
        </CollapsibleSection>
      )}

      {resume.sections.map((sec, i) => (
        <CollapsibleSection key={i} title={sec.title}>
          {sec.entries.map((entry, j) => (
            <div key={j} className="mb-2">
              <div className="flex justify-between items-baseline gap-1">
                <EditableText value={entry.heading} onChange={v => updateEntry(i, j, "heading", v)}
                  className="text-xs font-semibold text-text flex-1 min-w-0" placeholder="Company / Organization" />
                {entry.dates != null && entry.dates !== "" && (
                  <EditableText value={entry.dates} onChange={v => updateEntry(i, j, "dates", v)}
                    className="w-[110px] flex-none text-xs text-text-muted text-right" placeholder="Dates" />
                )}
              </div>
              <div className="flex justify-between items-baseline gap-1">
                <EditableText value={entry.subheading || ""} onChange={v => updateEntry(i, j, "subheading", v)}
                  className="text-xs text-text-muted italic flex-1 min-w-0" placeholder="Role / Title" />
                {entry.location != null && entry.location !== "" && (
                  <EditableText value={entry.location} onChange={v => updateEntry(i, j, "location", v)}
                    className="w-[110px] flex-none text-xs text-text-muted text-right" placeholder="Location" />
                )}
              </div>
              {entry.url != null && entry.url !== "" && (
                <EditableText
                  value={entry.url}
                  onChange={v => updateEntry(i, j, "url", v)}
                  className="mt-0.5 text-[11px] text-primary underline-offset-2 hover:underline"
                  placeholder="Project link"
                />
              )}
              {entry.bullets.map((b, k) => (
                <div key={k} className="flex items-start gap-1 group ml-2">
                  <span className="text-xs text-text-secondary mt-0.5">•</span>
                  <EditableText value={b} onChange={v => updateBullet(i, j, k, v)}
                    className="text-xs text-text-secondary flex-1" />
                  <button onClick={() => removeBullet(i, j, k)}
                    className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 flex-shrink-0 cursor-pointer">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
              <button onClick={() => addBullet(i, j)}
                className="text-xs text-primary hover:text-primary-dark flex items-center gap-0.5 ml-2 mt-0.5 cursor-pointer">
                <Plus className="w-3 h-3" /> Add bullet
              </button>
            </div>
          ))}
        </CollapsibleSection>
      ))}
    </>
  )
}
