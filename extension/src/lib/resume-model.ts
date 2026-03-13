import type {
  EditableResumeContact,
  EditableResumeJson,
  EditableResumeSkills,
  ResumeJson,
  ResumeSection
} from "./types"

const EMPTY_CONTACT: EditableResumeContact = {
  name: "",
  email: "",
  phone: "",
  location: "",
  linkedin: "",
  github: "",
  website: "",
  work_authorization: ""
}

function toEditableSkills(raw: unknown): EditableResumeSkills | null {
  if (!raw || typeof raw !== "object") return null

  const source = raw as Record<string, unknown>
  return {
    languages: Array.isArray(source.languages) ? source.languages.filter((value): value is string => typeof value === "string") : [],
    frameworks: Array.isArray(source.frameworks) ? source.frameworks.filter((value): value is string => typeof value === "string") : [],
    tools: Array.isArray(source.tools) ? source.tools.filter((value): value is string => typeof value === "string") : [],
    other: Array.isArray(source.other) ? source.other.filter((value): value is string => typeof value === "string") : []
  }
}

function normalizeSections(raw: Record<string, unknown>): ResumeSection[] {
  const sections: ResumeSection[] = []

  if (Array.isArray(raw.sections)) {
    for (const rawSection of raw.sections) {
      const section = rawSection as Record<string, unknown>
      sections.push({
        title: typeof section.title === "string" ? section.title : "",
        entries: Array.isArray(section.entries)
          ? section.entries.map((rawEntry) => {
              const entry = rawEntry as Record<string, unknown>
              return {
                heading: typeof entry.heading === "string" ? entry.heading : "",
                subheading: typeof entry.subheading === "string" ? entry.subheading : "",
                dates: typeof entry.dates === "string" ? entry.dates : "",
                location: typeof entry.location === "string" ? entry.location : "",
                url: typeof entry.url === "string" ? entry.url : "",
                bullets: Array.isArray(entry.bullets)
                  ? entry.bullets.filter((value): value is string => typeof value === "string")
                  : []
              }
            })
          : []
      })
    }
  }

  if (sections.length > 0) return sections

  if (Array.isArray(raw.experience) && raw.experience.length > 0) {
    sections.push({
      title: "Experience",
      entries: raw.experience.map((rawEntry) => {
        const entry = rawEntry as Record<string, unknown>
        const title = typeof entry.title === "string" ? entry.title : ""
        const company = typeof entry.company === "string" ? entry.company : ""
        const startDate = typeof entry.start_date === "string" ? entry.start_date : ""
        const endDate = typeof entry.end_date === "string" ? entry.end_date : "Present"
        const location = typeof entry.location === "string" ? entry.location : ""
        return {
          heading: `${title} at ${company}`.trim(),
          subheading: [startDate, endDate].filter(Boolean).join(" - ") + (location ? ` | ${location}` : ""),
          dates: [startDate, endDate].filter(Boolean).join(" - "),
          location,
          url: typeof entry.url === "string" ? entry.url : "",
          bullets: Array.isArray(entry.bullets)
            ? entry.bullets.filter((value): value is string => typeof value === "string")
            : []
        }
      })
    })
  }

  if (Array.isArray(raw.education) && raw.education.length > 0) {
    sections.push({
      title: "Education",
      entries: raw.education.map((rawEntry) => {
        const entry = rawEntry as Record<string, unknown>
        const degree = typeof entry.degree === "string" ? entry.degree : ""
        const school = typeof entry.school === "string" ? entry.school : ""
        const startDate = typeof entry.start_date === "string" ? entry.start_date : ""
        const endDate = typeof entry.end_date === "string" ? entry.end_date : ""
        const gpa = typeof entry.gpa === "string" ? entry.gpa : ""
        return {
          heading: `${degree} - ${school}`.trim(),
          subheading: [startDate, endDate].filter(Boolean).join(" - ") + (gpa ? ` | GPA: ${gpa}` : ""),
          dates: [startDate, endDate].filter(Boolean).join(" - "),
          url: typeof entry.url === "string" ? entry.url : "",
          bullets: []
        }
      })
    })
  }

  if (Array.isArray(raw.projects) && raw.projects.length > 0) {
    sections.push({
      title: "Projects",
      entries: raw.projects.map((rawEntry) => {
        const entry = rawEntry as Record<string, unknown>
        return {
          heading: typeof entry.name === "string" ? entry.name : "",
          subheading: Array.isArray(entry.technologies)
            ? entry.technologies.filter((value): value is string => typeof value === "string").join(", ")
            : "",
          url: typeof entry.url === "string" ? entry.url : "",
          bullets: Array.isArray(entry.bullets)
            ? entry.bullets.filter((value): value is string => typeof value === "string")
            : []
        }
      })
    })
  }

  return sections
}

export function normalizeEditableResume(raw: unknown): EditableResumeJson {
  const source = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}
  const rawContact = source.contact && typeof source.contact === "object" ? (source.contact as Record<string, unknown>) : {}

  return {
    contact: {
      ...EMPTY_CONTACT,
      name: typeof rawContact.name === "string" ? rawContact.name : "",
      email: typeof rawContact.email === "string" ? rawContact.email : "",
      phone: typeof rawContact.phone === "string" ? rawContact.phone : "",
      location: typeof rawContact.location === "string" ? rawContact.location : "",
      linkedin: typeof rawContact.linkedin === "string" ? rawContact.linkedin : "",
      github: typeof rawContact.github === "string" ? rawContact.github : "",
      website: typeof rawContact.website === "string" ? rawContact.website : "",
      work_authorization: typeof rawContact.work_authorization === "string" ? rawContact.work_authorization : ""
    },
    summary: typeof source.summary === "string" ? source.summary : "",
    skills: toEditableSkills(source.skills),
    sections: normalizeSections(source)
  }
}

export function parseStoredResumeJson(candidate: unknown): ResumeJson | null {
  if (!candidate) return null

  let parsed: unknown = candidate
  if (typeof candidate === "string") {
    try {
      parsed = JSON.parse(candidate)
    } catch {
      return null
    }
  }

  if (!parsed || typeof parsed !== "object") return null

  return normalizeEditableResume(parsed) as ResumeJson
}
