import { useEffect, useState, type ReactNode } from "react"
import {
  ArrowLeft,
  Briefcase,
  Building2,
  CalendarDays,
  Check,
  Download,
  ExternalLink,
  FileText,
  Loader2,
  MapPin,
  MessageSquareQuote,
  Pencil,
  RefreshCw,
  Save,
  ScrollText,
  Sparkles,
  StickyNote,
  X
} from "lucide-react"

import { createApiClient, type JobDetail as JobDetailRecord, type QAPairItem, type ResumeRecord } from "~lib/api"
import { parseStoredResumeJson } from "~lib/resume-model"
import type { ResumeContact, ResumeJson, ResumeSkills, StructuredJobDescription } from "~lib/types"

interface JobDetailProps {
  jobId: string
  onBack: () => void
}

const STATUS_OPTIONS = ["saved", "applied", "interviewing", "offer", "rejected", "withdrawn"]

const STATUS_COLORS: Record<string, string> = {
  saved: "bg-slate-100 text-slate-700 ring-slate-200",
  applied: "bg-sky-100 text-sky-700 ring-sky-200",
  interviewing: "bg-amber-100 text-amber-700 ring-amber-200",
  offer: "bg-emerald-100 text-emerald-700 ring-emerald-200",
  rejected: "bg-rose-100 text-rose-700 ring-rose-200",
  withdrawn: "bg-slate-200 text-slate-600 ring-slate-300"
}

function SectionCard({
  icon: Icon,
  title,
  subtitle,
  children
}: {
  icon: typeof ScrollText
  title: string
  subtitle?: string
  children: ReactNode
}) {
  return (
    <section className="card p-0 overflow-hidden shadow-sm shadow-sky-100/40">
      <div className="border-b border-slate-200 bg-gradient-to-r from-sky-50 via-white to-cyan-50 px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-primary ring-1 ring-sky-100">
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-text">{title}</h3>
            {subtitle ? <p className="text-sm text-text-muted">{subtitle}</p> : null}
          </div>
        </div>
      </div>
      <div className="px-6 py-5">{children}</div>
    </section>
  )
}

function MetaStat({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white/85 px-4 py-3 shadow-sm shadow-sky-100/20">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">{label}</p>
      <p className="mt-2 text-sm font-medium text-text">{value || "Unknown"}</p>
    </div>
  )
}

function EmptyMessage({ message }: { message: string }) {
  return <p className="text-sm leading-6 text-text-muted">{message}</p>
}

function StructuredTagGroup({
  label,
  values
}: {
  label: string
  values?: string[]
}) {
  if (!values?.length) return null

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">{label}</p>
      <div className="flex flex-wrap gap-2">
        {values.map((value) => (
          <span
            key={`${label}-${value}`}
            className="inline-flex items-center rounded-full border border-sky-100 bg-sky-50 px-3 py-1 text-xs font-medium text-sky-800"
          >
            {value}
          </span>
        ))}
      </div>
    </div>
  )
}

function StructuredJobDescriptionPanel({
  structured
}: {
  structured?: StructuredJobDescription | null
}) {
  if (!structured) return null

  const hasContent = Boolean(
    structured.role_focus ||
    structured.must_have_skills?.length ||
      structured.preferred_skills?.length ||
      structured.responsibilities?.length ||
      structured.domain_keywords?.length ||
      structured.seniority ||
      structured.work_mode ||
      structured.employment_type
  )

  if (!hasContent) return null

  return (
    <div className="space-y-5 rounded-[24px] border border-slate-200 bg-white px-5 py-5 shadow-sm shadow-sky-100/30">
      {structured.role_focus ? (
        <div className="space-y-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">Role focus</p>
          <p className="text-sm leading-6 text-text">{structured.role_focus}</p>
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-3">
        <MetaStat label="Seniority" value={structured.seniority} />
        <MetaStat label="Work mode" value={structured.work_mode} />
        <MetaStat label="Employment" value={structured.employment_type} />
      </div>

      <StructuredTagGroup label="Must-have skills" values={structured.must_have_skills} />
      <StructuredTagGroup label="Preferred skills" values={structured.preferred_skills} />
      <StructuredTagGroup label="Domain keywords" values={structured.domain_keywords} />

      {structured.responsibilities?.length ? (
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">Responsibilities</p>
          <ul className="space-y-2 text-sm leading-6 text-text">
            {structured.responsibilities.map((item, index) => (
              <li key={index} className="flex gap-3">
                <span className="mt-2 h-1.5 w-1.5 rounded-full bg-primary/70" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}

function SaveStateMessage({
  tone,
  message
}: {
  tone: "neutral" | "success" | "error"
  message?: string
}) {
  if (!message) return null

  const toneClass =
    tone === "error"
      ? "text-rose-700"
      : tone === "success"
        ? "text-emerald-700"
        : "text-text-muted"

  return <p className={`text-sm ${toneClass}`}>{message}</p>
}

function formatDate(value?: string | null) {
  if (!value) return "Unknown"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString([], { dateStyle: "medium", timeStyle: "short" })
}

function parseStoredResume(record?: ResumeRecord | null): ResumeJson | null {
  if (!record) return null

  const candidate = (record as ResumeRecord & { resume_json?: unknown }).resume_json ?? record.resume_text
  return parseStoredResumeJson(candidate)
}

function getTailoredResume(resumes: ResumeRecord[]) {
  return resumes.find((resume) => !resume.is_base) || resumes[0] || null
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

function renderContactLine(contact: ResumeContact) {
  const items = [
    contact.email,
    contact.phone,
    contact.location,
    contact.linkedin,
    contact.github,
    contact.website
  ].filter(Boolean)

  if (items.length === 0) return null

  return <p className="mt-2 text-sm text-text-muted">{items.join("  |  ")}</p>
}

function renderSkills(skills?: ResumeSkills) {
  if (!skills) return null

  const groups: Array<[string, string[] | undefined]> = [
    ["Languages", skills.languages],
    ["Frameworks", skills.frameworks],
    ["Tools", skills.tools],
    ["Other", skills.other]
  ].filter(([, values]) => Array.isArray(values) && values.length > 0) as Array<[string, string[]]>

  if (groups.length === 0) return null

  return (
    <div className="mt-6 space-y-3">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">Skills</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {groups.map(([label, values]) => (
          <div key={label} className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-text-secondary">{label}</p>
            <p className="mt-2 text-sm leading-6 text-text">{values.join(", ")}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

function ResumePreview({ resumes }: { resumes: ResumeRecord[] }) {
  const tailoredResume = getTailoredResume(resumes)
  const parsed = parseStoredResume(tailoredResume)

  if (!tailoredResume) {
    return <EmptyMessage message="No saved resume is attached to this job yet." />
  }

  if (!parsed) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5">
        <p className="text-sm font-medium text-text">Saved resume record found</p>
        <p className="mt-2 text-sm leading-6 text-text-muted">
          This resume exists in storage, but its structured JSON could not be parsed for preview.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="rounded-[24px] border border-slate-200 bg-white px-5 py-6 shadow-sm shadow-sky-100/30">
        <p className="text-xl font-semibold text-text">{parsed.contact?.name || "Saved tailored resume"}</p>
        {renderContactLine(parsed.contact || {})}

        {parsed.summary ? (
          <div className="mt-6">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">Summary</p>
            <p className="mt-2 text-sm leading-7 text-text">{parsed.summary}</p>
          </div>
        ) : null}

        {renderSkills(parsed.skills)}
      </div>

      {parsed.sections?.length ? (
        parsed.sections.map((section, index) => (
          <div key={`${section.title}-${index}`} className="rounded-[24px] border border-slate-200 bg-slate-50/70 px-5 py-5">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-secondary">
              {section.title}
            </p>
            <div className="mt-4 space-y-4">
              {section.entries?.map((entry, entryIndex) => (
                <div key={`${section.title}-${entryIndex}`} className="rounded-2xl border border-white bg-white px-4 py-4 shadow-sm shadow-slate-100/80">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-text">{entry.heading || "Untitled entry"}</p>
                      {entry.subheading ? (
                        <p className="mt-1 text-sm text-text-secondary">{entry.subheading}</p>
                      ) : null}
                      {entry.url ? (
                        <a
                          href={entry.url}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                          View link
                        </a>
                      ) : null}
                    </div>
                    <div className="min-w-[140px] space-y-1 text-right text-xs text-text-muted">
                      {entry.dates ? <p>{entry.dates}</p> : null}
                      {entry.location ? <p>{entry.location}</p> : null}
                    </div>
                  </div>
                  {entry.bullets?.length ? (
                    <ul className="mt-4 space-y-2 text-sm leading-6 text-text">
                      {entry.bullets.map((bullet, bulletIndex) => (
                        <li key={bulletIndex} className="flex gap-3">
                          <span className="mt-2 h-1.5 w-1.5 rounded-full bg-primary/70" />
                          <span>{bullet}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        ))
      ) : (
        <EmptyMessage message="The tailored resume does not have any saved sections yet." />
      )}
    </div>
  )
}

export default function JobDetail({ jobId, onBack }: JobDetailProps) {
  const [job, setJob] = useState<JobDetailRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statusDraft, setStatusDraft] = useState("saved")
  const [savingStatus, setSavingStatus] = useState(false)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [statusTone, setStatusTone] = useState<"neutral" | "success" | "error">("neutral")
  const [editingNotes, setEditingNotes] = useState(false)
  const [notesDraft, setNotesDraft] = useState("")
  const [savingNotes, setSavingNotes] = useState(false)
  const [notesMessage, setNotesMessage] = useState<string | null>(null)
  const [notesTone, setNotesTone] = useState<"neutral" | "success" | "error">("neutral")
  const [editingQaKey, setEditingQaKey] = useState<string | null>(null)
  const [qaDraft, setQaDraft] = useState("")
  const [savingQaKey, setSavingQaKey] = useState<string | null>(null)
  const [qaMessage, setQaMessage] = useState<string | null>(null)
  const [qaTone, setQaTone] = useState<"neutral" | "success" | "error">("neutral")
  const [downloadingPdf, setDownloadingPdf] = useState(false)
  const [pdfMessage, setPdfMessage] = useState<string | null>(null)
  const [pdfTone, setPdfTone] = useState<"neutral" | "success" | "error">("neutral")

  async function loadJob() {
    setLoading(true)
    setError(null)
    try {
      const client = await createApiClient()
      const data = await client.getJob(jobId)
      setJob(data)
      setStatusDraft(data.status || "saved")
      setNotesDraft(data.notes || "")
      setEditingNotes(false)
      setEditingQaKey(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load job details")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadJob()
  }, [jobId])

  async function handleSaveStatus() {
    if (!job || statusDraft === job.status) {
      setStatusTone("neutral")
      setStatusMessage("Status is already up to date.")
      return
    }

    setSavingStatus(true)
    setStatusMessage(null)

    try {
      const client = await createApiClient()
      const updated = await client.updateJob({
        job_id: job.id,
        company: job.company,
        title: job.title,
        status: statusDraft
      })
      setJob((prev) => (prev ? { ...prev, status: updated.status } : prev))
      setStatusDraft(updated.status)
      setStatusTone("success")
      setStatusMessage("Status saved.")
    } catch (err) {
      setStatusTone("error")
      setStatusMessage(err instanceof Error ? err.message : "Failed to save status")
    } finally {
      setSavingStatus(false)
    }
  }

  function startEditingQa(qa: QAPairItem, key: string) {
    setEditingQaKey(key)
    setQaDraft(qa.answer || "")
    setQaMessage(null)
  }

  function cancelEditingQa() {
    setEditingQaKey(null)
    setQaDraft("")
  }

  async function handleSaveQa(qa: QAPairItem, key: string) {
    if (!job) return

    setSavingQaKey(key)
    setQaMessage(null)

    try {
      const client = await createApiClient()
      const payload = {
        ...qa,
        answer: qaDraft,
        edited_by_user: true
      }
      const response = await client.saveQA(job.id, [payload])
      const savedQa = response.qa_pairs[0] || payload
      setJob((prev) =>
        prev
          ? {
              ...prev,
              qa_pairs: prev.qa_pairs.map((item) =>
                item.field_id === qa.field_id ? { ...item, ...savedQa } : item
              )
            }
          : prev
      )
      setQaTone("success")
      setQaMessage("Answer saved.")
      setEditingQaKey(null)
      setQaDraft("")
    } catch (err) {
      setQaTone("error")
      setQaMessage(err instanceof Error ? err.message : "Failed to save answer")
    } finally {
      setSavingQaKey(null)
    }
  }

  async function handleSaveNotes() {
    if (!job) return

    setSavingNotes(true)
    setNotesMessage(null)

    try {
      const client = await createApiClient()
      const updated = await client.updateJob({
        job_id: job.id,
        company: job.company,
        title: job.title,
        notes: notesDraft
      })
      setJob((prev) => (prev ? { ...prev, notes: updated.notes || "" } : prev))
      setNotesDraft(updated.notes || "")
      setEditingNotes(false)
      setNotesTone("success")
      setNotesMessage("Notes saved.")
    } catch (err) {
      setNotesTone("error")
      setNotesMessage(err instanceof Error ? err.message : "Failed to save notes")
    } finally {
      setSavingNotes(false)
    }
  }

  async function handleDownloadPdf() {
    if (!job) return

    const parsedResume = parseStoredResume(getTailoredResume(job.resumes))
    if (!parsedResume) {
      setPdfTone("error")
      setPdfMessage("Saved resume data is missing or not valid JSON.")
      return
    }

    setDownloadingPdf(true)
    setPdfMessage(null)

    try {
      const client = await createApiClient()
      const pdfBlob = await client.generatePdf(parsedResume)
      const filename = `${(job.company || "company").replace(/\s+/g, "_")}_${(job.title || "resume").replace(/\s+/g, "_")}.pdf`
      downloadBlob(pdfBlob, filename)
      setPdfTone("success")
      setPdfMessage("PDF download started.")
    } catch (err) {
      setPdfTone("error")
      setPdfMessage(err instanceof Error ? err.message : "Failed to download PDF")
    } finally {
      setDownloadingPdf(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="card overflow-hidden border-sky-100 bg-gradient-to-br from-sky-50 via-white to-cyan-50 p-0">
          <div className="animate-pulse px-6 py-8">
            <div className="h-4 w-28 rounded-full bg-sky-100" />
            <div className="mt-6 h-10 w-3/5 rounded-2xl bg-sky-100" />
            <div className="mt-3 h-4 w-2/5 rounded-full bg-slate-100" />
            <div className="mt-8 grid gap-3 md:grid-cols-4">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="h-20 rounded-2xl bg-white/80" />
              ))}
            </div>
          </div>
        </div>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.7fr)_minmax(280px,1fr)]">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="card animate-pulse">
              <div className="h-4 w-32 rounded-full bg-slate-100" />
              <div className="mt-4 space-y-3">
                <div className="h-4 rounded-full bg-slate-100" />
                <div className="h-4 rounded-full bg-slate-100" />
                <div className="h-4 w-4/5 rounded-full bg-slate-100" />
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (error || !job) {
    return (
      <div className="card max-w-2xl border-rose-100 bg-rose-50/60 py-10 text-center">
        <p className="text-sm font-medium text-rose-700">{error || "Job details could not be loaded."}</p>
        <div className="mt-5 flex items-center justify-center gap-3">
          <button onClick={onBack} className="btn-secondary">
            <ArrowLeft className="h-4 w-4" />
            Back to tracker
          </button>
          <button onClick={loadJob} className="btn-primary">
            <RefreshCw className="h-4 w-4" />
            Retry
          </button>
        </div>
      </div>
    )
  }

  const statusColor = STATUS_COLORS[job.status] || STATUS_COLORS.saved
  const notesDirty = notesDraft !== (job.notes || "")
  const structuredJobDescription = (job.structured_job_description || null) as StructuredJobDescription | null

  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-[28px] border border-sky-100 bg-gradient-to-br from-sky-50 via-white to-cyan-50 shadow-sm shadow-sky-100/60">
        <div className="px-6 py-6 md:px-8 md:py-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-4">
              <button onClick={onBack} className="btn-secondary">
                <ArrowLeft className="h-4 w-4" />
                Back to tracker
              </button>
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-3">
                  <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold capitalize ring-1 ${statusColor}`}>
                    {job.status}
                  </span>
                  <span className="text-xs font-medium uppercase tracking-[0.16em] text-text-muted">
                    Saved {formatDate(job.created_at)}
                  </span>
                </div>
                <h2 className="max-w-3xl text-3xl font-semibold tracking-tight text-slate-900">
                  {job.title || "Untitled role"}
                </h2>
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-text-secondary">
                  <span className="inline-flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-primary" />
                    {job.company || "Unknown company"}
                  </span>
                  {job.location ? (
                    <span className="inline-flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-primary" />
                      {job.location}
                    </span>
                  ) : null}
                  {job.url ? (
                    <a
                      href={job.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 text-primary hover:text-primary-dark"
                    >
                      <ExternalLink className="h-4 w-4" />
                      Open posting
                    </a>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-white/80 bg-white/70 px-4 py-4 shadow-sm shadow-sky-100/40">
                  <div className="min-w-[200px] flex-1">
                    <label className="label mb-2">Application Status</label>
                    <select
                      value={statusDraft}
                      onChange={(event) => setStatusDraft(event.target.value)}
                      className="input-field"
                    >
                      {STATUS_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option.charAt(0).toUpperCase() + option.slice(1)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    onClick={handleSaveStatus}
                    className="btn-primary"
                    disabled={savingStatus || statusDraft === job.status}
                  >
                    {savingStatus ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Save status
                  </button>
                </div>
                <SaveStateMessage tone={statusTone} message={statusMessage || undefined} />
              </div>
            </div>

            <div className="grid w-full gap-3 md:grid-cols-2 xl:w-[420px]">
              <MetaStat label="Work mode" value={job.job_type} />
              <MetaStat label="Employment" value={job.employment_type} />
              <MetaStat label="Salary" value={job.salary_range} />
              <MetaStat label="Applied" value={job.applied_at ? formatDate(job.applied_at) : "Not recorded"} />
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.7fr)_minmax(300px,1fr)]">
        <div className="space-y-6">
          <SectionCard
            icon={ScrollText}
            title="Job Description"
            subtitle="The cleaned description saved for this application."
          >
            <div className="space-y-4">
              <StructuredJobDescriptionPanel structured={structuredJobDescription} />
              {job.job_description ? (
                <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 px-5 py-5 text-sm leading-7 text-text whitespace-pre-wrap">
                  {job.job_description}
                </div>
              ) : (
                <EmptyMessage message="No job description was saved for this application." />
              )}
            </div>
          </SectionCard>

          <SectionCard
            icon={Sparkles}
            title="Tailored Resume"
            subtitle="The saved structured resume generated for this role."
          >
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <SaveStateMessage tone={pdfTone} message={pdfMessage || undefined} />
              <button onClick={handleDownloadPdf} className="btn-secondary" disabled={downloadingPdf}>
                {downloadingPdf ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                Download PDF
              </button>
            </div>
            <ResumePreview resumes={job.resumes} />
          </SectionCard>
        </div>

        <div className="space-y-6">
          <SectionCard
            icon={MessageSquareQuote}
            title="Saved Form Q&A"
            subtitle="Answers captured from application forms."
          >
            <div className="mb-4">
              <SaveStateMessage tone={qaTone} message={qaMessage || undefined} />
            </div>
            {job.qa_pairs.length ? (
              <div className="space-y-3">
                {job.qa_pairs.map((qa, index) => (
                  <div key={`${qa.field_id}-${index}`} className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm shadow-slate-100/70">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-text-muted">
                      {qa.field_type || "Field"}
                    </p>
                    <p className="mt-2 text-sm font-medium leading-6 text-text">{qa.question || "Untitled question"}</p>
                    {editingQaKey === `${qa.field_id}-${index}` ? (
                      <div className="mt-3 space-y-3">
                        <textarea
                          value={qaDraft}
                          onChange={(event) => setQaDraft(event.target.value)}
                          className="input-field min-h-[120px] resize-y"
                        />
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="text-xs text-text-muted">
                            This save will mark the answer as edited by the user.
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={cancelEditingQa}
                              className="btn-secondary"
                              disabled={savingQaKey === `${qa.field_id}-${index}`}
                            >
                              <X className="h-4 w-4" />
                              Cancel
                            </button>
                            <button
                              onClick={() => handleSaveQa(qa, `${qa.field_id}-${index}`)}
                              className="btn-primary"
                              disabled={savingQaKey === `${qa.field_id}-${index}`}
                            >
                              {savingQaKey === `${qa.field_id}-${index}` ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Check className="h-4 w-4" />
                              )}
                              Save answer
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <>
                        <p className="mt-3 text-sm leading-6 text-text-secondary whitespace-pre-wrap">
                          {qa.answer || "No saved answer yet."}
                        </p>
                        <div className="mt-3 flex items-center justify-between gap-3">
                          <p className="text-xs text-text-muted">
                            {qa.edited_by_user ? "Edited by user" : "Saved from form automation"}
                          </p>
                          <button
                            onClick={() => startEditingQa(qa, `${qa.field_id}-${index}`)}
                            className="btn-secondary"
                          >
                            <Pencil className="h-4 w-4" />
                            Edit answer
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <EmptyMessage message="No form answers are saved for this job yet." />
            )}
          </SectionCard>

          <SectionCard
            icon={StickyNote}
            title="Notes"
            subtitle="Private notes saved on the job record."
          >
            <div className="space-y-4">
              <SaveStateMessage tone={notesTone} message={notesMessage || undefined} />
              {editingNotes ? (
                <>
                  <textarea
                    value={notesDraft}
                    onChange={(event) => setNotesDraft(event.target.value)}
                    placeholder="Add private notes about the role, recruiter, or follow-ups."
                    className="input-field min-h-[180px] resize-y"
                  />
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-xs text-text-muted">
                      Notes are saved to the shared job record and will appear after reload.
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setNotesDraft(job.notes || "")
                          setEditingNotes(false)
                        }}
                        className="btn-secondary"
                        disabled={savingNotes}
                      >
                        <X className="h-4 w-4" />
                        Cancel
                      </button>
                      <button
                        onClick={handleSaveNotes}
                        className="btn-primary"
                        disabled={savingNotes || !notesDirty}
                      >
                        {savingNotes ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        Save notes
                      </button>
                    </div>
                  </div>
                </>
              ) : job.notes ? (
                <div className="rounded-[24px] border border-slate-200 bg-amber-50/50 px-5 py-5 text-sm leading-7 text-text whitespace-pre-wrap">
                  {job.notes}
                </div>
              ) : (
                <EmptyMessage message="No notes have been added to this job yet." />
              )}
              {!editingNotes ? (
                <div className="flex justify-end">
                  <button onClick={() => setEditingNotes(true)} className="btn-secondary">
                    <Pencil className="h-4 w-4" />
                    {job.notes ? "Edit notes" : "Add notes"}
                  </button>
                </div>
              ) : null}
            </div>
          </SectionCard>

          <SectionCard
            icon={FileText}
            title="Record Snapshot"
            subtitle="Saved metadata for this tracker entry."
          >
            <div className="space-y-3 text-sm text-text-secondary">
              <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3">
                <Briefcase className="h-4 w-4 text-primary" />
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-text-muted">Job ID</p>
                  <p className="mt-1 break-all text-text">{job.id}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3">
                <CalendarDays className="h-4 w-4 text-primary" />
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-text-muted">Created</p>
                  <p className="mt-1 text-text">{formatDate(job.created_at)}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3">
                <Sparkles className="h-4 w-4 text-primary" />
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-text-muted">Saved resumes</p>
                  <p className="mt-1 text-text">{job.resumes.length}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3">
                <MessageSquareQuote className="h-4 w-4 text-primary" />
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-text-muted">Saved answers</p>
                  <p className="mt-1 text-text">{job.qa_pairs.length}</p>
                </div>
              </div>
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  )
}
