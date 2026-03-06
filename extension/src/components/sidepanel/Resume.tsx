import { useState, useEffect, useCallback } from "react"
import { FileText, Download, Loader, AlertCircle, CheckCircle, Copy, RefreshCw, ChevronDown, ChevronRight } from "lucide-react"
import { createApiClient } from "~lib/api"
import { getStorage, setStorage } from "~lib/storage"
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
  const [jdText, setJdText] = useState("")
  const [company, setCompany] = useState("")
  const [jobTitle, setJobTitle] = useState("")
  const [jobUrl, setJobUrl] = useState("")
  const [tailoredJson, setTailoredJson] = useState<ResumeJSON | null>(null)
  const [matchScore, setMatchScore] = useState(0)
  const [copied, setCopied] = useState(false)

  // Restore session on mount
  useEffect(() => {
    debug("Resume", "Component mounted")
    getStorage("resume_session").then(session => {
      if (session && session.phase !== "idle") {
        setPhase(session.phase as Phase)
        setJdText(session.jdText)
        setCompany(session.company)
        setJobTitle(session.jobTitle)
        setJobUrl(session.jobUrl)
        setTailoredJson(session.tailoredJson as ResumeJSON | null)
        setMatchScore(session.matchScore)
        debug("Resume", "Restored session, phase:", session.phase)
      }
    })
  }, [])

  // Save session whenever state changes
  const saveSession = useCallback((p: Phase, jd: string, co: string, jt: string, ju: string, tj: ResumeJSON | null, ms: number) => {
    setStorage("resume_session", {
      phase: p, jdText: jd, company: co, jobTitle: jt, jobUrl: ju,
      tailoredJson: tj, matchScore: ms,
    })
  }, [])

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
      debug("Resume", `JD extracted: ${result.text.length} chars, company=${result.company}, title=${result.job_title}`)
      debug("Resume", `Readability: used=${result.used_readability}, title=${result.readability_title}, siteName=${result.readability_siteName}`)
      debug("Resume", "Full extracted text:", result.text)
      setJdText(result.text)
      setJobUrl(result.url)
      setCompany(result.company || "")
      setJobTitle(result.job_title || "")
      setPhase("extracted")
      saveSession("extracted", result.text, result.company || "", result.job_title || "", result.url, null, 0)
    } catch (err) {
      debugError("Resume", "EXTRACT_JD failed:", err)
      setError(err instanceof Error ? err.message : "Could not connect to the page. Try refreshing the page.")
    } finally {
      setLoading(false)
    }
  }

  async function handleTailor() {
    setLoading(true)
    setError("")
    try {
      const resumeJson = await getStorage("base_resume_json")
      if (!resumeJson) {
        setError("No resume found. Go to Settings and add your base resume first.")
        return
      }

      const client = await createApiClient()
      const companyName = company || "Unknown Company"
      const title = jobTitle || "Unknown Position"
      debug("Resume", `Logging job: ${companyName} - ${title}`)
      const jobResult = await client.logJob({
        company: companyName, title, url: jobUrl,
        job_description: jdText, status: "saved"
      })

      debug("Resume", "Calling tailor-resume...")
      const tailorResult = await client.tailorResume({
        job_description: jdText, resume_json: resumeJson, job_id: jobResult.id
      })
      debug("Resume", "Tailor result:", { matchScore: tailorResult.match_score })

      const json = tailorResult.tailored_resume_json as ResumeJSON
      setTailoredJson(json)
      setMatchScore(tailorResult.match_score)
      setPhase("tailored")
      saveSession("tailored", jdText, company, jobTitle, jobUrl, json, tailorResult.match_score)
    } catch (err) {
      debugError("Resume", "Tailor failed:", err)
      setError(err instanceof Error ? err.message : "Failed to tailor resume")
    } finally {
      setLoading(false)
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

  function handleReset() {
    setPhase("idle"); setJdText(""); setCompany(""); setJobTitle("")
    setJobUrl(""); setTailoredJson(null); setMatchScore(0); setError("")
    setStorage("resume_session", null)
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="flex items-start gap-2 text-red-600 bg-red-50 rounded-lg p-3">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <p className="text-sm">{error}</p>
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
          <div className="card p-3 max-h-96 overflow-y-auto space-y-3">
            <ResumePreview resume={tailoredJson} />
          </div>
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

function ResumePreview({ resume }: { resume: ResumeJSON }) {
  const c = resume.contact
  return (
    <>
      <div className="text-center">
        {c.name && <p className="text-sm font-bold text-text">{c.name}</p>}
        <p className="text-xs text-text-muted">
          {[c.email, c.phone, c.location].filter(Boolean).join("  •  ")}
        </p>
        {[c.linkedin, c.github, c.website].filter(Boolean).length > 0 && (
          <p className="text-xs text-text-muted">
            {[c.linkedin, c.github, c.website].filter(Boolean).join("  •  ")}
          </p>
        )}
      </div>
      {resume.summary && (
        <CollapsibleSection title="Summary">
          <p className="text-xs text-text-secondary">{resume.summary}</p>
        </CollapsibleSection>
      )}
      {resume.skills && (
        <CollapsibleSection title="Skills">
          {([
            ["Languages", resume.skills.languages], ["Frameworks", resume.skills.frameworks],
            ["Tools", resume.skills.tools], ["Other", resume.skills.other]
          ] as [string, string[] | undefined][])
            .filter(([, v]) => v?.length)
            .map(([cat, vals]) => (
              <p key={cat} className="text-xs text-text-secondary">
                <span className="font-semibold">{cat}:</span> {vals!.join(", ")}
              </p>
            ))}
        </CollapsibleSection>
      )}
      {resume.sections.map((sec, i) => (
        <CollapsibleSection key={i} title={sec.title}>
          {sec.entries.map((entry, j) => (
            <div key={j} className="mb-2">
              <div className="flex justify-between items-baseline">
                {entry.heading && <p className="text-xs font-semibold text-text">{entry.heading}</p>}
                {entry.dates && <p className="text-xs text-text-muted flex-shrink-0 ml-2">{entry.dates}</p>}
              </div>
              <div className="flex justify-between items-baseline">
                {entry.subheading && <p className="text-xs text-text-muted italic">{entry.subheading}</p>}
                {entry.location && <p className="text-xs text-text-muted flex-shrink-0 ml-2">{entry.location}</p>}
              </div>
              {entry.bullets.map((b, k) => (
                <p key={k} className="text-xs text-text-secondary ml-2">• {b}</p>
              ))}
            </div>
          ))}
        </CollapsibleSection>
      ))}
    </>
  )
}
