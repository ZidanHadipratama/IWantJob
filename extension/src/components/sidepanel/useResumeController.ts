import { useCallback, useEffect, useState } from "react"

import { createApiClient } from "~lib/api"
import { debug, debugError } from "~lib/debug"
import { sendToContentScript } from "~lib/messaging"
import {
  getStorage,
  normalizeActiveJobContext,
  normalizeFillFormSession,
  normalizeResumeSession,
  setStorage,
  type ActiveJobContext,
  type InFlightRequest
} from "~lib/storage"
import type { ExtractJDResponse, ResumeJson, StructuredJobDescription } from "~lib/types"

export type ResumePhase = "idle" | "extracted" | "tailored"

export interface ResumeController {
  phase: ResumePhase
  loading: boolean
  downloading: boolean
  error: string
  jobId: string | null
  jdText: string
  structuredJobDescription: StructuredJobDescription | null
  company: string
  jobTitle: string
  jobUrl: string
  pageTitle: string
  pageExcerpt: string
  metadataLines: string[]
  tailoredJson: ResumeJson | null
  matchScore: number
  copied: boolean
  persistenceState: "draft" | "saved"
  saveTone: "neutral" | "success" | "error"
  saveMessage: string
  hasLocalEditsOnSavedJob: boolean
  metadataWarning: string
  handleExtractJD: () => Promise<void>
  handleTailor: () => Promise<void>
  handleCopy: () => Promise<void>
  handleDownloadPdf: () => Promise<void>
  handleResumeChange: (nextResume: ResumeJson) => void
  handleReset: () => void
  handleContinueToFillForm: () => Promise<void>
}

function resumeToText(resume: ResumeJson): string {
  const lines: string[] = []
  const contact = resume.contact

  if (contact.name) lines.push(contact.name)

  const contactParts = [contact.email, contact.phone, contact.location].filter(Boolean)
  const links = [contact.linkedin, contact.github, contact.website].filter(Boolean)
  if (links.length) contactParts.push(...links)
  if (contactParts.length) lines.push(contactParts.join("  |  "))
  lines.push("")

  if (resume.summary) {
    lines.push("SUMMARY")
    lines.push(resume.summary)
    lines.push("")
  }

  if (resume.skills) {
    const categories = [
      ["Languages", resume.skills.languages],
      ["Frameworks", resume.skills.frameworks],
      ["Tools", resume.skills.tools],
      ["Other", resume.skills.other]
    ] as [string, string[] | undefined][]
    const filled = categories.filter(([, values]) => values?.length)
    if (filled.length) {
      lines.push("SKILLS")
      for (const [category, values] of filled) {
        lines.push(`  ${category}: ${values!.join(", ")}`)
      }
      lines.push("")
    }
  }

  for (const section of resume.sections) {
    lines.push(section.title.toUpperCase())
    for (const entry of section.entries) {
      if (entry.heading) {
        const parts = [entry.heading]
        if (entry.location) parts.push(entry.location)
        lines.push(parts.join(" | "))
      }
      if (entry.subheading) {
        const parts = [entry.subheading]
        if (entry.dates) parts.push(entry.dates)
        lines.push(`  ${parts.join(" | ")}`)
      } else if (entry.dates) {
        lines.push(`  ${entry.dates}`)
      }
      for (const bullet of entry.bullets) lines.push(`  - ${bullet}`)
      lines.push("")
    }
  }

  return lines.join("\n")
}

export function useResumeController(): ResumeController {
  const [phase, setPhase] = useState<ResumePhase>("idle")
  const [loading, setLoading] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState("")
  const [jobId, setJobId] = useState<string | null>(null)
  const [jdText, setJdText] = useState("")
  const [structuredJobDescription, setStructuredJobDescription] = useState<StructuredJobDescription | null>(null)
  const [company, setCompany] = useState("")
  const [jobTitle, setJobTitle] = useState("")
  const [jobUrl, setJobUrl] = useState("")
  const [pageTitle, setPageTitle] = useState("")
  const [pageExcerpt, setPageExcerpt] = useState("")
  const [metadataLines, setMetadataLines] = useState<string[]>([])
  const [tailoredJson, setTailoredJson] = useState<ResumeJson | null>(null)
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

    setPhase(session.phase as ResumePhase)
    setJobId(session.jobId || null)
    setJdText(session.jdText)
    setStructuredJobDescription(session.structuredJobDescription || null)
    setCompany(session.company)
    setJobTitle(session.jobTitle)
    setJobUrl(session.jobUrl)
    setPageTitle(session.pageTitle || "")
    setPageExcerpt(session.pageExcerpt || "")
    setMetadataLines(Array.isArray(session.metadataLines) ? session.metadataLines : [])
    setTailoredJson(session.tailoredJson || null)
    setMatchScore(session.matchScore)
    setLoading(session.inFlightRequest?.kind === "tailor_resume")
  }, [])

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
          setPhase(context.phase as ResumePhase)
          setJobId(context.job_id || null)
          setJdText(context.job_description)
          setStructuredJobDescription(context.structured_job_description || null)
          setCompany(context.company)
          setJobTitle(context.job_title)
          setJobUrl(context.job_url)
          setPageTitle(context.page_title || "")
          setPageExcerpt(context.page_excerpt || "")
          setMetadataLines(Array.isArray(context.metadata_lines) ? context.metadata_lines : [])
          setTailoredJson(context.tailored_resume_json || null)
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
    function handleStorageChange(changes: Record<string, chrome.storage.StorageChange>, areaName: string) {
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

  const saveSession = useCallback((
    nextPhase: ResumePhase,
    id: string | null,
    jd: string,
    structured: StructuredJobDescription | null,
    nextCompany: string,
    nextJobTitle: string,
    nextJobUrl: string,
    nextPageTitle: string,
    nextPageExcerpt: string,
    nextMetadataLines: string[],
    nextTailoredJson: ResumeJson | null,
    nextMatchScore: number,
    inFlightRequest: InFlightRequest | null = null
  ) => {
    return setStorage("resume_session", {
      phase: nextPhase,
      jobId: id,
      jdText: jd,
      structuredJobDescription: structured,
      company: nextCompany,
      jobTitle: nextJobTitle,
      jobUrl: nextJobUrl,
      pageTitle: nextPageTitle,
      pageExcerpt: nextPageExcerpt,
      metadataLines: nextMetadataLines,
      tailoredJson: nextTailoredJson,
      matchScore: nextMatchScore,
      inFlightRequest
    })
  }, [])

  const syncActiveJobContext = useCallback((context: Omit<ActiveJobContext, "draft_qa_pairs"> | null) => {
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
        draft_qa_pairs:
          canReuseDraftAnswers && Array.isArray(existing?.draft_qa_pairs)
            ? existing.draft_qa_pairs
            : []
      })
    })
  }, [])

  useEffect(() => {
    if (phase === "idle" || !jdText.trim()) return

    void syncActiveJobContext({
      phase,
      persistence_state: persistenceState,
      job_id: jobId,
      job_description: jdText,
      structured_job_description: structuredJobDescription,
      company,
      job_title: jobTitle,
      job_url: jobUrl,
      page_title: pageTitle,
      page_excerpt: pageExcerpt,
      metadata_lines: metadataLines,
      tailored_resume_json: tailoredJson
    })
  }, [
    phase,
    persistenceState,
    jobId,
    jdText,
    structuredJobDescription,
    company,
    jobTitle,
    jobUrl,
    pageTitle,
    pageExcerpt,
    metadataLines,
    tailoredJson,
    syncActiveJobContext
  ])

  const handleExtractJD = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      debug("Resume", "Sending EXTRACT_JD to content script...")
      const result: ExtractJDResponse = await sendToContentScript("EXTRACT_JD")
      if (!result.success || !result.text.trim()) {
        setError("Could not extract text from this page. Make sure you're on a job description page.")
        return
      }
      await Promise.all([setStorage("fillform_session", null), setStorage("active_job_context", null)])
      debug("Resume", `JD extracted: ${result.text.length} chars, company=${result.company}, title=${result.job_title}`)
      debug("Resume", `Readability: used=${result.used_readability}, title=${result.readability_title}, siteName=${result.readability_siteName}`)
      debug("Resume", "Full extracted text:", result.text)
      setJdText(result.text)
      setJobUrl(result.url)
      setJobId(null)
      setCompany(result.company || "")
      setJobTitle(result.job_title || "")
      setStructuredJobDescription(null)
      setPageTitle(result.page_title || "")
      setPageExcerpt(result.readability_excerpt || "")
      setMetadataLines(result.metadata_lines || [])
      setTailoredJson(null)
      setMatchScore(0)
      setPersistenceState("draft")
      setSaveTone("neutral")
      setSaveMessage("")
      setPhase("extracted")
      await saveSession(
        "extracted",
        null,
        result.text,
        null,
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
  }, [saveSession])

  const handleTailor = useCallback(async () => {
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
        structuredJobDescription,
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
        jobInfo: tailorResult.job_info,
        structuredJobDescription: tailorResult.structured_job_description
      })

      const json = tailorResult.tailored_resume_json
      const nextStructuredJobDescription = tailorResult.structured_job_description || null
      const resolvedCompany = tailorResult.job_info?.company || companyName
      const resolvedTitle = tailorResult.job_info?.title || title
      const latestSession = normalizeResumeSession(await getStorage("resume_session"))
      if (latestSession?.inFlightRequest?.id !== requestId) {
        debug("Resume", "Ignoring stale tailor response for request", requestId)
        return
      }
      await Promise.all([setStorage("fillform_session", null), setStorage("active_job_context", null)])
      const resolvedJobId = null
      setJobId(resolvedJobId)
      setStructuredJobDescription(nextStructuredJobDescription)
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
        nextStructuredJobDescription,
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
          structuredJobDescription,
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
  }, [
    company,
    jdText,
    jobId,
    jobTitle,
    jobUrl,
    matchScore,
    metadataLines,
    pageExcerpt,
    pageTitle,
    saveSession,
    structuredJobDescription,
    tailoredJson
  ])

  const handleCopy = useCallback(async () => {
    if (!tailoredJson) return
    await navigator.clipboard.writeText(resumeToText(tailoredJson))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [tailoredJson])

  const handleDownloadPdf = useCallback(async () => {
    if (!tailoredJson) return
    setDownloading(true)
    setError("")
    try {
      const client = await createApiClient()
      const blob = await client.generatePdf(tailoredJson)
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement("a")
      anchor.href = url
      anchor.download = `${tailoredJson.contact.name || "resume"}_tailored.pdf`
      anchor.click()
      URL.revokeObjectURL(url)
      debug("Resume", "PDF downloaded successfully")
    } catch (err) {
      debugError("Resume", "PDF download failed:", err)
      setError(err instanceof Error ? err.message : "Failed to generate PDF")
    } finally {
      setDownloading(false)
    }
  }, [tailoredJson])

  const handleResumeChange = useCallback((nextResume: ResumeJson) => {
    setPersistenceState("draft")
    setSaveTone("neutral")
    setSaveMessage("")
    setTailoredJson(nextResume)
  }, [])

  const handleReset = useCallback(() => {
    setPhase("idle")
    setJobId(null)
    setJdText("")
    setCompany("")
    setJobTitle("")
    setJobUrl("")
    setPageTitle("")
    setPageExcerpt("")
    setMetadataLines([])
    setTailoredJson(null)
    setStructuredJobDescription(null)
    setMatchScore(0)
    setError("")
    setLoading(false)
    setPersistenceState("draft")
    setSaveTone("neutral")
    setSaveMessage("")
    void setStorage("resume_session", null)
    void setStorage("fillform_session", null)
    void setStorage("active_job_context", null)
  }, [])

  const handleContinueToFillForm = useCallback(async () => {
    await setStorage("sidepanel_active_tab", "fill-form")
  }, [])

  return {
    phase,
    loading,
    downloading,
    error,
    jobId,
    jdText,
    structuredJobDescription,
    company,
    jobTitle,
    jobUrl,
    pageTitle,
    pageExcerpt,
    metadataLines,
    tailoredJson,
    matchScore,
    copied,
    persistenceState,
    saveTone,
    saveMessage,
    hasLocalEditsOnSavedJob: persistenceState === "draft" && Boolean(jobId),
    metadataWarning:
      phase !== "idle" && !company.trim() && !jobTitle.trim()
        ? "Page metadata is missing for this draft. Review the title and company carefully before saving."
        : "",
    handleExtractJD,
    handleTailor,
    handleCopy,
    handleDownloadPdf,
    handleResumeChange,
    handleReset,
    handleContinueToFillForm
  }
}
