import { useState, useEffect, useCallback } from "react"
import { FileText, Download, Loader, AlertCircle, CheckCircle, Copy, RefreshCw, ChevronDown, ChevronRight, Pencil, X, Plus, Trash2 } from "lucide-react"
import { createApiClient } from "~lib/api"
import {
  getStorage,
  type InFlightRequest,
  normalizeActiveJobContext,
  normalizeFillFormSession,
  normalizeResumeSession,
  setStorage,
  type ActiveJobContext
} from "~lib/storage"
import { debug, debugError } from "~lib/debug"
import { sendToContentScript } from "~lib/messaging"
import type { ExtractJDResponse } from "~lib/types"

type Phase = "idle" | "extracted" | "tailored"

interface ResumeContact {
  name?: string; email?: string; phone?: string; location?: string
  linkedin?: string; github?: string; website?: string; work_authorization?: string
}
interface ResumeSkills {
  languages?: string[]; frameworks?: string[]; tools?: string[]; other?: string[]
}
interface ResumeSectionEntry {
  heading: string; subheading?: string; dates?: string
  location?: string; url?: string; bullets: string[]
}
interface ResumeSection {
  title: string; entries: ResumeSectionEntry[]
}
interface ResumeJSON {
  contact: ResumeContact; summary?: string
  skills?: ResumeSkills; sections: ResumeSection[]
}

export default function Resume() {
  const [phase, setPhase] = useState<Phase>("idle")
  const [loading, setLoading] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState("")
  const [jobId, setJobId] = useState<string | null>(null)
  const [jdText, setJdText] = useState("")
  const [company, setCompany] = useState("")
  const [jobTitle, setJobTitle] = useState("")
  const [jobUrl, setJobUrl] = useState("")
  const [pageTitle, setPageTitle] = useState("")
  const [pageExcerpt, setPageExcerpt] = useState("")
  const [metadataLines, setMetadataLines] = useState<string[]>([])
  const [tailoredJson, setTailoredJson] = useState<ResumeJSON | null>(null)
  const [matchScore, setMatchScore] = useState(0)
  const [copied, setCopied] = useState(false)
  const [persistenceState, setPersistenceState] = useState<"draft" | "saved">("draft")
  const [saveTone, setSaveTone] = useState<"neutral" | "success" | "error">("neutral")
  const [saveMessage, setSaveMessage] = useState("")

  const applyResumeSession = useCallback((session: ReturnType<typeof normalizeResumeSession>) => {
    if (!session) {
      setLoading(false)
      return
    }

    setPhase(session.phase as Phase)
    setJobId(session.jobId || null)
    setJdText(session.jdText)
    setCompany(session.company)
    setJobTitle(session.jobTitle)
    setJobUrl(session.jobUrl)
    setPageTitle(session.pageTitle || "")
    setPageExcerpt(session.pageExcerpt || "")
    setMetadataLines(Array.isArray(session.metadataLines) ? session.metadataLines : [])
    setTailoredJson(session.tailoredJson as ResumeJSON | null)
    setMatchScore(session.matchScore)
    setLoading(session.inFlightRequest?.kind === "tailor_resume")
  }, [])

  // Restore session on mount
  useEffect(() => {
    debug("Resume", "Component mounted")
    Promise.all([
      getStorage("resume_session"),
      getStorage("active_job_context"),
      getStorage("fillform_session")
    ]).then(([sessionRaw, contextRaw, fillFormRaw]) => {
      const session = normalizeResumeSession(sessionRaw)
      const context = normalizeActiveJobContext(contextRaw)
      const fillFormSession = normalizeFillFormSession(fillFormRaw)

      if (context) {
        if (session) {
          applyResumeSession(session)
        } else {
          setPhase(context.phase as Phase)
          setJobId(context.job_id || null)
          setJdText(context.job_description)
          setCompany(context.company)
          setJobTitle(context.job_title)
          setJobUrl(context.job_url)
          setPageTitle(context.page_title || "")
          setPageExcerpt(context.page_excerpt || "")
          setMetadataLines(Array.isArray(context.metadata_lines) ? context.metadata_lines : [])
          setTailoredJson((context.tailored_resume_json as ResumeJSON | null) || null)
          setLoading(false)
        }
        setPersistenceState(context.persistence_state || "draft")
        setMatchScore(session?.matchScore || 0)
        debug("Resume", "Restored active job context, phase:", context.phase)
        return
      }

      if (fillFormSession) {
        setSaveTone("neutral")
        setSaveMessage("Recovered a form draft, but the matching Resume context is incomplete. Rebuild the Resume flow before saving.")
      }

      if (session && session.phase !== "idle") {
        applyResumeSession(session)
        setPersistenceState("draft")
        debug("Resume", "Restored session, phase:", session.phase)
      }
    })
  }, [applyResumeSession])

  useEffect(() => {
    function handleStorageChange(
      changes: Record<string, chrome.storage.StorageChange>,
      areaName: string
    ) {
      if (areaName !== "local") return

      if (changes.resume_session) {
        const nextSession = normalizeResumeSession(changes.resume_session.newValue)
        if (nextSession) {
          applyResumeSession(nextSession)
        } else {
          setLoading(false)
        }
      }

      if (changes.active_job_context) {
        const nextContext = normalizeActiveJobContext(changes.active_job_context.newValue)
        setJobId(nextContext?.job_id || null)
        setPersistenceState(nextContext?.persistence_state || "draft")
        if (nextContext?.persistence_state === "draft") {
          setSaveTone("neutral")
          setSaveMessage("")
        }
      }
    }

    chrome.storage.onChanged.addListener(handleStorageChange)
    return () => chrome.storage.onChanged.removeListener(handleStorageChange)
  }, [applyResumeSession])

  // Save session whenever state changes
  const saveSession = useCallback((
    p: Phase,
    id: string | null,
    jd: string,
    co: string,
    jt: string,
    ju: string,
    pt: string,
    pe: string,
    ml: string[],
    tj: ResumeJSON | null,
    ms: number,
    inFlightRequest: InFlightRequest | null = null
  ) => {
    return setStorage("resume_session", {
      phase: p, jobId: id, jdText: jd, company: co, jobTitle: jt, jobUrl: ju,
      pageTitle: pt, pageExcerpt: pe, metadataLines: ml,
      tailoredJson: tj, matchScore: ms, inFlightRequest
    })
  }, [])

  const syncActiveJobContext = useCallback((
    context: Omit<ActiveJobContext, "draft_qa_pairs"> | null
  ) => {
    if (!context) {
      return setStorage("active_job_context", null)
    }

    return getStorage("active_job_context").then((existingRaw) => {
      const existing = normalizeActiveJobContext(existingRaw)
      const canReuseDraftAnswers = Boolean(
        existing &&
        existing.job_url === context.job_url &&
        existing.page_title === context.page_title
      )

      return setStorage("active_job_context", {
        ...context,
        persistence_state: context.persistence_state,
        draft_qa_pairs: canReuseDraftAnswers && Array.isArray(existing?.draft_qa_pairs)
          ? existing.draft_qa_pairs
          : []
      })
    })
  }, [])

  useEffect(() => {
    if (phase === "idle" || !jdText.trim()) return

    syncActiveJobContext({
      phase,
      persistence_state: persistenceState,
      job_id: jobId,
      job_description: jdText,
      company,
      job_title: jobTitle,
      job_url: jobUrl,
      page_title: pageTitle,
      page_excerpt: pageExcerpt,
      metadata_lines: metadataLines,
      tailored_resume_json: tailoredJson
    })
  }, [phase, persistenceState, jobId, jdText, company, jobTitle, jobUrl, pageTitle, pageExcerpt, metadataLines, tailoredJson, syncActiveJobContext])

  async function handleExtractJD() {
    setLoading(true)
    setError("")
    try {
      debug("Resume", "Sending EXTRACT_JD to content script...")
      const result: ExtractJDResponse = await sendToContentScript("EXTRACT_JD")
      if (!result.success || !result.text.trim()) {
        setError("Could not extract text from this page. Make sure you're on a job description page.")
        return
      }
      await Promise.all([
        setStorage("fillform_session", null),
        setStorage("active_job_context", null)
      ])
      debug("Resume", `JD extracted: ${result.text.length} chars, company=${result.company}, title=${result.job_title}`)
      debug("Resume", `Readability: used=${result.used_readability}, title=${result.readability_title}, siteName=${result.readability_siteName}`)
      debug("Resume", "Full extracted text:", result.text)
      setJdText(result.text)
      setJobUrl(result.url)
      setJobId(null)
      setCompany(result.company || "")
      setJobTitle(result.job_title || "")
      setPageTitle(result.page_title || "")
      setPageExcerpt(result.readability_excerpt || "")
      setMetadataLines(result.metadata_lines || [])
      setTailoredJson(null)
      setMatchScore(0)
      setPersistenceState("draft")
      setSaveTone("neutral")
      setSaveMessage("")
      setPhase("extracted")
      saveSession(
        "extracted",
        null,
        result.text,
        result.company || "",
        result.job_title || "",
        result.url,
        result.page_title || "",
        result.readability_excerpt || "",
        result.metadata_lines || [],
        null,
        0
      )
    } catch (err) {
      debugError("Resume", "EXTRACT_JD failed:", err)
      setError(err instanceof Error ? err.message : "Could not connect to the page. Try refreshing the page.")
    } finally {
      setLoading(false)
    }
  }

  async function handleTailor() {
    const requestId = crypto.randomUUID()
    setLoading(true)
    setError("")
    let shouldClearLoading = false
    try {
      const resumeJson = await getStorage("base_resume_json")
      if (!resumeJson) {
        setError("No resume found. Go to Settings and add your base resume first.")
        return
      }

      await saveSession(
        "extracted",
        jobId,
        jdText,
        company,
        jobTitle,
        jobUrl,
        pageTitle,
        pageExcerpt,
        metadataLines,
        tailoredJson,
        matchScore,
        { id: requestId, kind: "tailor_resume" }
      )

      const client = await createApiClient()
      const companyName = company || "Unknown Company"
      const title = jobTitle || "Unknown Position"

      debug("Resume", "Calling tailor-resume...")
      const tailorResult = await client.tailorResume({
        job_description: jdText,
        resume_json: resumeJson,
        company: companyName,
        title,
        url: jobUrl,
        page_title: pageTitle,
        page_excerpt: pageExcerpt,
        metadata_lines: metadataLines,
        persist_job: false
      })
      debug("Resume", "Tailor result:", {
        matchScore: tailorResult.match_score,
        jobId: tailorResult.job_id,
        jobInfo: tailorResult.job_info
      })

      const json = tailorResult.tailored_resume_json as ResumeJSON
      const resolvedCompany = tailorResult.job_info?.company || companyName
      const resolvedTitle = tailorResult.job_info?.title || title
      const latestSession = normalizeResumeSession(await getStorage("resume_session"))
      if (latestSession?.inFlightRequest?.id !== requestId) {
        debug("Resume", "Ignoring stale tailor response for request", requestId)
        return
      }
      await Promise.all([
        setStorage("fillform_session", null),
        setStorage("active_job_context", null)
      ])
      const resolvedJobId = null
      setJobId(resolvedJobId)
      setCompany(resolvedCompany)
      setJobTitle(resolvedTitle)
      setTailoredJson(json)
      setMatchScore(tailorResult.match_score)
      setPersistenceState("draft")
      setSaveTone("neutral")
      setSaveMessage("")
      setPhase("tailored")
      await saveSession(
        "tailored",
        resolvedJobId,
        jdText,
        resolvedCompany,
        resolvedTitle,
        jobUrl,
        pageTitle,
        pageExcerpt,
        metadataLines,
        json,
        tailorResult.match_score,
        null
      )
      shouldClearLoading = true
    } catch (err) {
      debugError("Resume", "Tailor failed:", err)
      const latestSession = normalizeResumeSession(await getStorage("resume_session"))
      if (latestSession?.inFlightRequest?.id === requestId) {
        await saveSession(
          "extracted",
          jobId,
          jdText,
          company,
          jobTitle,
          jobUrl,
          pageTitle,
          pageExcerpt,
          metadataLines,
          tailoredJson,
          matchScore,
          null
        )
        shouldClearLoading = true
      }
      setError(err instanceof Error ? err.message : "Failed to tailor resume")
    } finally {
      if (shouldClearLoading) {
        setLoading(false)
      }
    }
  }

  function resumeToText(r: ResumeJSON): string {
    const lines: string[] = []
    const c = r.contact
    if (c.name) lines.push(c.name)
    const contactParts = [c.email, c.phone, c.location].filter(Boolean)
    const links = [c.linkedin, c.github, c.website].filter(Boolean)
    if (links.length) contactParts.push(...links)
    if (contactParts.length) lines.push(contactParts.join("  |  "))
    lines.push("")
    if (r.summary) { lines.push("SUMMARY"); lines.push(r.summary); lines.push("") }
    if (r.skills) {
      const cats = [
        ["Languages", r.skills.languages], ["Frameworks", r.skills.frameworks],
        ["Tools", r.skills.tools], ["Other", r.skills.other]
      ] as [string, string[] | undefined][]
      const filled = cats.filter(([, v]) => v?.length)
      if (filled.length) {
        lines.push("SKILLS")
        for (const [cat, vals] of filled) lines.push(`  ${cat}: ${vals!.join(", ")}`)
        lines.push("")
      }
    }
    for (const sec of r.sections) {
      lines.push(sec.title.toUpperCase())
      for (const e of sec.entries) {
        if (e.heading) {
          const parts = [e.heading]
          if (e.location) parts.push(e.location)
          lines.push(parts.join(" | "))
        }
        if (e.subheading) {
          const parts = [e.subheading]
          if (e.dates) parts.push(e.dates)
          lines.push(`  ${parts.join(" | ")}`)
        } else if (e.dates) {
          lines.push(`  ${e.dates}`)
        }
        for (const b of e.bullets) lines.push(`  - ${b}`)
        lines.push("")
      }
    }
    return lines.join("\n")
  }

  async function handleCopy() {
    if (!tailoredJson) return
    await navigator.clipboard.writeText(resumeToText(tailoredJson))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function handleDownloadPdf() {
    if (!tailoredJson) return
    setDownloading(true)
    setError("")
    try {
      const client = await createApiClient()
      const blob = await client.generatePdf(tailoredJson)
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `${tailoredJson.contact.name || "resume"}_tailored.pdf`
      a.click()
      URL.revokeObjectURL(url)
      debug("Resume", "PDF downloaded successfully")
    } catch (err) {
      debugError("Resume", "PDF download failed:", err)
      setError(err instanceof Error ? err.message : "Failed to generate PDF")
    } finally {
      setDownloading(false)
    }
  }

  function handleResumeChange(nextResume: ResumeJSON) {
    setPersistenceState("draft")
    setSaveTone("neutral")
    setSaveMessage("")
    setTailoredJson(nextResume)
  }

  function handleReset() {
    setPhase("idle"); setJobId(null); setJdText(""); setCompany(""); setJobTitle("")
    setJobUrl(""); setPageTitle(""); setPageExcerpt(""); setMetadataLines([])
    setTailoredJson(null); setMatchScore(0); setError(""); setLoading(false)
    setPersistenceState("draft")
    setSaveTone("neutral")
    setSaveMessage("")
    setStorage("resume_session", null)
    setStorage("fillform_session", null)
    setStorage("active_job_context", null)
  }

  const hasLocalEditsOnSavedJob = persistenceState === "draft" && Boolean(jobId)
  const metadataWarning =
    phase !== "idle" && !company.trim() && !jobTitle.trim()
      ? "Page metadata is missing for this draft. Review the title and company carefully before saving."
      : ""

  async function handleContinueToFillForm() {
    await setStorage("sidepanel_active_tab", "fill-form")
  }

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

function CollapsibleSection({ title, children }: { title: string; children: React.ReactNode }) {
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

function ResumePreview({ resume, onChange }: { resume: ResumeJSON; onChange: (r: ResumeJSON) => void }) {
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
