import { useState, useEffect, useRef, useCallback } from "react"
import { Loader, AlertCircle, CheckCircle, Plus, Trash2, ChevronDown, ChevronRight } from "lucide-react"
import { getStorage, setStorage } from "~lib/storage"
import { createApiClient } from "~lib/api"

interface ResumeUploadCardProps {
  onConfigChange?: (configured: boolean) => void
}

interface SectionEntry {
  heading: string
  subheading: string
  dates?: string
  location?: string
  url?: string
  bullets: string[]
}

interface ResumeSection {
  title: string
  entries: SectionEntry[]
}

interface ResumeContact {
  name: string
  email: string
  phone: string
  location: string
  linkedin: string
  github: string
  website: string
  work_authorization: string
}

interface ResumeSkills {
  languages: string[]
  frameworks: string[]
  tools: string[]
  other: string[]
}

interface ParsedResume {
  contact: ResumeContact
  summary: string
  skills: ResumeSkills | null
  sections: ResumeSection[]
}

const WORK_AUTH_OPTIONS = [
  { value: "", label: "Select..." },
  { value: "us_citizen", label: "US Citizen" },
  { value: "green_card", label: "Green Card" },
  { value: "h1b", label: "H1B" },
  { value: "opt", label: "OPT" },
  { value: "other", label: "Other" }
]

const EMPTY_CONTACT: ResumeContact = {
  name: "", email: "", phone: "", location: "",
  linkedin: "", github: "", website: "", work_authorization: ""
}

function toEditable(raw: any): ParsedResume {
  const c = raw?.contact || {}
  const sections: ResumeSection[] = []

  // Handle new format (sections array)
  if (raw?.sections) {
    for (const s of raw.sections) {
      sections.push({
        title: s.title || "",
        entries: (s.entries || []).map((e: any) => ({
          heading: e.heading || "",
          subheading: e.subheading || "",
          dates: e.dates || "",
          location: e.location || "",
          url: e.url || "",
          bullets: e.bullets || [],
        })),
      })
    }
  }

  // Migrate old format if no sections found
  if (sections.length === 0) {
    if (raw?.experience?.length) {
      sections.push({
        title: "Experience",
        entries: raw.experience.map((e: any) => ({
          heading: `${e.title || ""} at ${e.company || ""}`.trim(),
          subheading: [e.start_date, e.end_date || "Present"].filter(Boolean).join(" - ") +
            (e.location ? ` | ${e.location}` : ""),
          dates: [e.start_date, e.end_date || "Present"].filter(Boolean).join(" - "),
          location: e.location || "",
          url: e.url || "",
          bullets: e.bullets || [],
        })),
      })
    }
    if (raw?.education?.length) {
      sections.push({
        title: "Education",
        entries: raw.education.map((e: any) => ({
          heading: `${e.degree || ""} - ${e.school || ""}`.trim(),
          subheading: [e.start_date, e.end_date].filter(Boolean).join(" - ") +
            (e.gpa ? ` | GPA: ${e.gpa}` : ""),
          dates: [e.start_date, e.end_date].filter(Boolean).join(" - "),
          url: e.url || "",
          bullets: [],
        })),
      })
    }
    if (raw?.projects?.length) {
      sections.push({
        title: "Projects",
        entries: raw.projects.map((p: any) => ({
          heading: p.name || "",
          subheading: p.technologies?.join(", ") || "",
          url: p.url || "",
          bullets: p.bullets || [],
        })),
      })
    }
  }

  return {
    contact: {
      name: c.name || "",
      email: c.email || "",
      phone: c.phone || "",
      location: c.location || "",
      linkedin: c.linkedin || "",
      github: c.github || "",
      website: c.website || "",
      work_authorization: c.work_authorization || "",
    },
    summary: raw?.summary || "",
    skills: raw?.skills ? {
      languages: raw.skills.languages || [],
      frameworks: raw.skills.frameworks || [],
      tools: raw.skills.tools || [],
      other: raw.skills.other || [],
    } : null,
    sections,
  }
}

function ContactFields({ contact, onChange }: {
  contact: ResumeContact
  onChange: (c: ResumeContact) => void
}) {
  const fields: { key: keyof ResumeContact; label: string; placeholder: string }[] = [
    { key: "name", label: "Full Name", placeholder: "John Doe" },
    { key: "email", label: "Email", placeholder: "john@example.com" },
    { key: "phone", label: "Phone", placeholder: "+1 234 567 890" },
    { key: "location", label: "Location", placeholder: "San Francisco, CA" },
    { key: "linkedin", label: "LinkedIn", placeholder: "https://linkedin.com/in/..." },
    { key: "github", label: "GitHub", placeholder: "https://github.com/..." },
    { key: "website", label: "Website", placeholder: "https://..." },
  ]

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-text">Contact</h3>
      <div className="grid grid-cols-2 gap-2">
        {fields.map(f => (
          <div key={f.key}>
            <label className="text-xs text-text-muted">{f.label}</label>
            <input
              type="text"
              value={contact[f.key]}
              onChange={e => onChange({ ...contact, [f.key]: e.target.value })}
              placeholder={f.placeholder}
              className="input-field text-sm py-1"
            />
          </div>
        ))}
        <div>
          <label className="text-xs text-text-muted">Work Authorization</label>
          <select
            value={contact.work_authorization}
            onChange={e => onChange({ ...contact, work_authorization: e.target.value })}
            className="input-field text-sm py-1">
            {WORK_AUTH_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      </div>
    </div>
  )
}

function SkillsFields({ skills, onChange }: {
  skills: ResumeSkills
  onChange: (s: ResumeSkills) => void
}) {
  const categories: { key: keyof ResumeSkills; label: string }[] = [
    { key: "languages", label: "Languages" },
    { key: "frameworks", label: "Frameworks" },
    { key: "tools", label: "Tools" },
    { key: "other", label: "Other" },
  ]

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-text">Skills</h3>
      {categories.map(cat => (
        <div key={cat.key}>
          <label className="text-xs text-text-muted">{cat.label}</label>
          <input
            type="text"
            value={(skills[cat.key] || []).join(", ")}
            onChange={e => {
              const vals = e.target.value
                .split(",")
                .map(s => s.trim())
                .filter(Boolean)
              onChange({ ...skills, [cat.key]: vals })
            }}
            placeholder="Comma-separated values"
            className="input-field text-sm py-1"
          />
        </div>
      ))}
    </div>
  )
}

function SectionEditor({ section, onUpdate, onRemove }: {
  section: ResumeSection
  onUpdate: (s: ResumeSection) => void
  onRemove: () => void
}) {
  const [collapsed, setCollapsed] = useState(false)

  function updateEntry(idx: number, entry: SectionEntry) {
    const entries = [...section.entries]
    entries[idx] = entry
    onUpdate({ ...section, entries })
  }

  function removeEntry(idx: number) {
    onUpdate({ ...section, entries: section.entries.filter((_, i) => i !== idx) })
  }

  function addEntry() {
    onUpdate({
      ...section,
      entries: [...section.entries, { heading: "", subheading: "", dates: "", location: "", url: "", bullets: [] }]
    })
  }

  return (
    <div className="border border-gray-200 rounded-lg">
      <div className="flex items-center justify-between p-3 bg-gray-50 rounded-t-lg">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setCollapsed(!collapsed)}
            className="text-text-muted hover:text-text cursor-pointer">
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          <input
            type="text"
            value={section.title}
            onChange={e => onUpdate({ ...section, title: e.target.value })}
            className="text-sm font-semibold text-text bg-transparent border-none outline-none focus:ring-0 p-0"
            placeholder="Section Title"
          />
          <span className="text-xs text-text-muted">({section.entries.length})</span>
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="text-text-muted hover:text-red-500 cursor-pointer"
          title="Remove section">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {!collapsed && (
        <div className="p-3 space-y-3">
          {section.entries.map((entry, idx) => (
            <div key={idx} className="border border-gray-100 rounded-lg p-2.5 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 space-y-2">
                  <div>
                    <label className="text-xs text-text-muted">Heading</label>
                    <input
                      type="text"
                      value={entry.heading}
                      onChange={e => updateEntry(idx, { ...entry, heading: e.target.value })}
                      placeholder="e.g. Software Engineer at Google"
                      className="input-field text-sm py-1"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-text-muted">Subtitle</label>
                    <input
                      type="text"
                      value={entry.subheading || ""}
                      onChange={e => updateEntry(idx, { ...entry, subheading: e.target.value })}
                      placeholder="e.g. Jan 2020 - Present | Mountain View, CA"
                      className="input-field text-sm py-1"
                    />
                  </div>
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                    <div>
                      <label className="text-xs text-text-muted">Dates</label>
                      <input
                        type="text"
                        value={entry.dates || ""}
                        onChange={e => updateEntry(idx, { ...entry, dates: e.target.value })}
                        placeholder="e.g. Jan 2024 - Present"
                        className="input-field text-sm py-1"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-text-muted">Location</label>
                      <input
                        type="text"
                        value={entry.location || ""}
                        onChange={e => updateEntry(idx, { ...entry, location: e.target.value })}
                        placeholder="e.g. Remote"
                        className="input-field text-sm py-1"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-text-muted">Link URL</label>
                      <input
                        type="text"
                        value={entry.url || ""}
                        onChange={e => updateEntry(idx, { ...entry, url: e.target.value })}
                        placeholder="https://github.com/..."
                        className="input-field text-sm py-1"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-text-muted">Bullets (one per line)</label>
                    <textarea
                      value={entry.bullets.join("\n")}
                      onChange={e => updateEntry(idx, {
                        ...entry,
                        bullets: e.target.value.split("\n").filter(l => l.trim() !== "")
                      })}
                      placeholder="- Built X that improved Y..."
                      rows={Math.max(2, entry.bullets.length + 1)}
                      className="input-field text-sm py-1 font-mono resize-y"
                    />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => removeEntry(idx)}
                  className="text-text-muted hover:text-red-500 mt-4 cursor-pointer"
                  title="Remove entry">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
          <button
            type="button"
            onClick={addEntry}
            className="flex items-center gap-1 text-xs text-primary hover:text-primary-700 font-medium cursor-pointer">
            <Plus className="w-3.5 h-3.5" /> Add Entry
          </button>
        </div>
      )}
    </div>
  )
}

export function ResumeUploadCard({ onConfigChange }: ResumeUploadCardProps) {
  const [resumeText, setResumeText] = useState("")
  const [isParsing, setIsParsing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState("")
  const [editData, setEditData] = useState<ParsedResume | null>(null)
  const [savedIndicator, setSavedIndicator] = useState(false)
  const textDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const editDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const didHydrateRef = useRef(false)

  const onConfigChangeRef = useRef(onConfigChange)
  onConfigChangeRef.current = onConfigChange

  useEffect(() => {
    Promise.all([
      getStorage("base_resume_text"),
      getStorage("base_resume_json")
    ]).then(([text, json]) => {
      if (json) {
        setEditData(toEditable(json))
        onConfigChangeRef.current?.(true)
      }
      if (text) {
        setResumeText(text)
        if (!json) onConfigChangeRef.current?.(text.trim().length > 0)
      }
    })
  }, [])

  const saveTextLocally = useCallback(
    (text: string) => {
      if (textDebounceRef.current) clearTimeout(textDebounceRef.current)
      textDebounceRef.current = setTimeout(async () => {
        await setStorage("base_resume_text", text)
      }, 500)
    },
    []
  )

  useEffect(() => {
    if (!didHydrateRef.current) {
      didHydrateRef.current = true
      return
    }

    if (!editData) return

    if (editDebounceRef.current) clearTimeout(editDebounceRef.current)
    editDebounceRef.current = setTimeout(async () => {
      await setStorage("base_resume_json", editData)
      onConfigChangeRef.current?.(true)
    }, 500)

    return () => {
      if (editDebounceRef.current) clearTimeout(editDebounceRef.current)
    }
  }, [editData])

  useEffect(() => {
    return () => {
      if (textDebounceRef.current) clearTimeout(textDebounceRef.current)
      if (editDebounceRef.current) clearTimeout(editDebounceRef.current)
    }
  }, [])

  function handleTextChange(value: string) {
    setResumeText(value)
    saveTextLocally(value)
    setError("")
  }

  async function handleParseAndSave() {
    if (!resumeText.trim()) {
      setError("Please paste your resume text first")
      return
    }

    setIsParsing(true)
    setError("")

    try {
      const client = await createApiClient()
      const result = await client.parseResume(resumeText)

      if (result.resume_json) {
        const editable = toEditable(result.resume_json)
        setEditData(editable)
        await setStorage("base_resume_json", result.resume_json)
        await setStorage("base_resume_text", resumeText)
        setSavedIndicator(true)
        setTimeout(() => setSavedIndicator(false), 2000)
        onConfigChange?.(true)
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to parse resume"
      )
    } finally {
      setIsParsing(false)
    }
  }

  async function handleSaveEdits() {
    if (!editData) return
    setIsSaving(true)
    setError("")

    // Clean up: remove null skills categories, convert to API format
    const payload = {
      contact: editData.contact,
      summary: editData.summary || null,
      skills: editData.skills,
      sections: editData.sections,
    }

    try {
      const client = await createApiClient()
      const result = await client.saveResumeJson(payload)
      if (result.resume_json) {
        await setStorage("base_resume_json", result.resume_json)
        setSavedIndicator(true)
        setTimeout(() => setSavedIndicator(false), 2000)
        onConfigChange?.(true)
      }
    } catch (err) {
      // Save locally even if backend fails
      await setStorage("base_resume_json", payload)
      setSavedIndicator(true)
      setTimeout(() => setSavedIndicator(false), 2000)
      onConfigChange?.(true)
    } finally {
      setIsSaving(false)
    }
  }

  function addSection() {
    if (!editData) return
    setEditData({
      ...editData,
      sections: [...editData.sections, {
        title: "New Section",
        entries: [{ heading: "", subheading: "", dates: "", location: "", url: "", bullets: [] }]
      }]
    })
  }

  function updateSection(idx: number, section: ResumeSection) {
    if (!editData) return
    const sections = [...editData.sections]
    sections[idx] = section
    setEditData({ ...editData, sections })
  }

  function removeSection(idx: number) {
    if (!editData) return
    setEditData({
      ...editData,
      sections: editData.sections.filter((_, i) => i !== idx)
    })
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-text">Base Resume</h2>
        {savedIndicator && (
          <span className="text-xs text-primary font-medium">Saved</span>
        )}
      </div>

      {error && (
        <div className="mb-3 flex items-start gap-2 text-red-600">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <p className="text-sm">{error}</p>
        </div>
      )}

      {/* Text input area */}
      <div className="mb-4">
        <label htmlFor="resume-text" className="label">
          Paste Resume Text
        </label>
        <textarea
          id="resume-text"
          value={resumeText}
          onChange={(e) => handleTextChange(e.target.value)}
          placeholder="Paste your full resume text here, then click Parse..."
          rows={8}
          className="input-field resize-y font-mono"
        />
        <div className="flex items-center justify-between mt-2">
          <p className="text-xs text-text-muted">
            {resumeText.length > 0
              ? `${resumeText.length} characters`
              : "Paste your resume, then click Parse"}
          </p>
          <button
            type="button"
            onClick={handleParseAndSave}
            disabled={isParsing || !resumeText.trim()}
            className="btn-primary text-sm px-4 py-1.5 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2">
            {isParsing ? (
              <>
                <Loader className="w-4 h-4 animate-spin" />
                Parsing...
              </>
            ) : (
              editData ? "Re-Parse" : "Parse"
            )}
          </button>
        </div>
      </div>

      {/* Structured form editor */}
      {editData && (
        <div className="border-t border-gray-200 pt-4 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-600" />
              <h3 className="text-sm font-semibold text-text">Parsed Resume</h3>
            </div>
            <p className="text-xs text-text-muted">Edit any field below, then save</p>
          </div>

          {/* Contact */}
          <ContactFields
            contact={editData.contact}
            onChange={contact => setEditData({ ...editData, contact })}
          />

          {/* Summary */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-text">Summary</h3>
            <textarea
              value={editData.summary}
              onChange={e => setEditData({ ...editData, summary: e.target.value })}
              placeholder="Professional summary or objective..."
              rows={3}
              className="input-field text-sm py-1 resize-y"
            />
          </div>

          {/* Skills */}
          {editData.skills && (
            <SkillsFields
              skills={editData.skills}
              onChange={skills => setEditData({ ...editData, skills })}
            />
          )}

          {/* Dynamic Sections */}
          {editData.sections.map((section, idx) => (
            <SectionEditor
              key={idx}
              section={section}
              onUpdate={s => updateSection(idx, s)}
              onRemove={() => removeSection(idx)}
            />
          ))}

          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={addSection}
              className="flex items-center gap-1 text-sm text-primary hover:text-primary-700 font-medium cursor-pointer">
              <Plus className="w-4 h-4" /> Add Section
            </button>

            <button
              type="button"
              onClick={handleSaveEdits}
              disabled={isSaving}
              className="btn-primary text-sm px-5 py-2 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2">
              {isSaving ? (
                <>
                  <Loader className="w-4 h-4 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Resume"
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
