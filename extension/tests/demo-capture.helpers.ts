import fs from "node:fs/promises"
import path from "node:path"

import type { BrowserContext, Locator, Page } from "@playwright/test"

const demoBaseUrl = "http://127.0.0.1:4173"
const demoBackendUrl = "http://demo-backend.local"
const framesRoot = path.resolve(__dirname, "..", "..", "tmp", "demo-capture", "frames")

export const DEMO_BASE_URL = demoBaseUrl
export const DEMO_BACKEND_URL = demoBackendUrl
export const DEMO_FRAMES_ROOT = framesRoot

const demoResumeJson = {
  contact: {
    name: "Mochamad Zidan Hadipratama",
    email: "zidan@example.com",
    phone: "+62 812 0000 0000",
    location: "Surabaya, Indonesia",
    linkedin: "linkedin.com/in/zidan",
    github: "github.com/zidanhadipratama"
  },
  summary:
    "Full stack product engineer who ships polished React and TypeScript interfaces with Python backend services, workflow automation, and practical AI-assisted features.",
  skills: {
    languages: ["TypeScript", "Python", "SQL"],
    frameworks: ["React", "Next.js", "FastAPI"],
    tools: ["PostgreSQL", "Docker", "AWS"],
    other: ["RAG workflows", "Prompt engineering", "Product prototyping"]
  },
  sections: [
    {
      title: "Experience",
      entries: [
        {
          heading: "Product Engineer",
          subheading: "Syntra Labs",
          dates: "2024 - Present",
          location: "Remote",
          bullets: [
            "Built AI-assisted job-application tooling with Chrome extension and FastAPI architecture.",
            "Owned full-stack delivery across React, TypeScript, Python, and Supabase-backed workflows."
          ]
        }
      ]
    }
  ]
}

const demoJobDescription = `Northstar Labs builds internal tooling and AI-assisted workflow software for distributed revenue teams.

We are hiring a product-minded engineer who can move across React, TypeScript, Python, and backend APIs to ship high-quality user-facing experiences.

What you will do:
- Build and iterate on React and TypeScript product surfaces used daily by revenue teams.
- Design backend APIs and automation jobs using Python and lightweight serverless tooling.
- Work directly with design and product to turn rough prototypes into production features.
- Instrument and improve AI-assisted workflows where reliability matters more than hype.

What we are looking for:
- 3+ years building production web applications with React and TypeScript.
- Experience with Python, REST APIs, PostgreSQL, and cloud deployment fundamentals.
- Clear written communication and ownership in remote teams.`

const demoAnswers = [
  {
    field_id: "firstname",
    label: "First name",
    answer: "Mochamad Zidan",
    field_type: "text"
  },
  {
    field_id: "lastname",
    label: "Last name",
    answer: "Hadipratama",
    field_type: "text"
  },
  {
    field_id: "email",
    label: "Email",
    answer: "zidan@example.com",
    field_type: "text"
  },
  {
    field_id: "address",
    label: "Address",
    answer: "Surabaya, Indonesia",
    field_type: "text"
  },
  {
    field_id: "linkedin",
    label: "LinkedIn profile",
    answer: "https://linkedin.com/in/zidan",
    field_type: "text"
  },
  {
    field_id: "summary",
    label: "Professional summary",
    answer:
      "Full stack product engineer with a strong bias for shipping usable interfaces, practical automation, and reliable AI-assisted workflows.",
    field_type: "textarea"
  },
  {
    field_id: "cover_letter",
    label: "Why do you want to join Northstar Labs?",
    answer:
      "I want to help a product-focused team ship thoughtful workflow software where product craft, engineering quality, and AI reliability all matter at the same time.",
    field_type: "textarea"
  },
  {
    field_id: "experience_level",
    label: "Years of professional experience",
    answer: "3-5 years",
    field_type: "select"
  },
  {
    field_id: "education_level",
    label: "Educational attainment",
    answer: "Bachelor's degree",
    field_type: "combobox"
  },
  {
    field_id: "react_typescript",
    label: "Do you have hands-on experience with React and TypeScript?",
    answer: "Yes",
    field_type: "radio"
  },
  {
    field_id: "tech_stack",
    label: "Which technologies have you used professionally?",
    answer: "React, TypeScript, Python, PostgreSQL, AWS",
    field_type: "checkbox"
  },
  {
    field_id: "work_mode",
    label: "Preferred work mode",
    answer: "Remote",
    field_type: "select"
  },
  {
    field_id: "start_date",
    label: "How soon can you start?",
    answer: "Within 2 weeks",
    field_type: "combobox"
  }
]

const demoTrackerJob = {
  id: "demo-job-001",
  company: "Northstar Labs",
  title: "Full Stack Product Engineer",
  url: `${demoBaseUrl}/job-posting.html`,
  status: "saved",
  job_type: "remote",
  employment_type: "full-time",
  location: "Singapore",
  salary_range: "USD 4,000-6,500 / month",
  created_at: "2026-03-11T08:00:00Z"
}

const demoJobDetail = {
  ...demoTrackerJob,
  job_description: demoJobDescription,
  notes: "High-signal role for the public demo. Persona is enabled to show answer framing.",
  qa_pairs: demoAnswers.map((answer) => ({
    field_id: answer.field_id,
    question: answer.label,
    answer: answer.answer,
    field_type: answer.field_type,
    edited_by_user: true
  })),
  resumes: [
    {
      id: "resume-demo-001",
      job_id: "demo-job-001",
      resume_json: demoResumeJson,
      resume_text: "",
      pdf_url: null,
      is_base: false,
      created_at: "2026-03-11T08:00:00Z"
    }
  ],
  chat_messages: []
}

export async function ensureCleanFrameDir(clipName: string) {
  const clipDir = path.join(framesRoot, clipName)
  await fs.rm(clipDir, { recursive: true, force: true })
  await fs.mkdir(clipDir, { recursive: true })
  return clipDir
}

export async function captureFrame(target: Page | Locator, clipName: string, index: number, label: string) {
  const clipDir = path.join(framesRoot, clipName)
  await fs.mkdir(clipDir, { recursive: true })
  const filename = `${String(index).padStart(3, "0")}-${label}.png`
  const outputPath = path.join(clipDir, filename)
  await target.screenshot({ path: outputPath, animations: "disabled" })
}

export async function captureComposedFrame(
  page: Page,
  sidepanelPage: Page,
  clipName: string,
  index: number,
  label: string
) {
  const clipDir = path.join(framesRoot, clipName)
  await fs.mkdir(clipDir, { recursive: true })
  const prefix = `${String(index).padStart(3, "0")}-${label}`

  await page.screenshot({
    path: path.join(clipDir, `${prefix}-page.png`),
    animations: "disabled"
  })

  await sidepanelPage.screenshot({
    path: path.join(clipDir, `${prefix}-panel.png`),
    animations: "disabled"
  })
}

export async function seedExtensionStorage(page: Page, seed: Record<string, unknown>) {
  await page.evaluate(async (value) => {
    await chrome.storage.local.clear()
    await chrome.storage.local.set(value)
  }, seed)
  await page.reload()
}

export async function installDemoApiMocks(context: BrowserContext) {
  await context.route(`${demoBackendUrl}/**`, async (route) => {
    const url = new URL(route.request().url())
    const method = route.request().method().toUpperCase()

    const respond = async (body: unknown, status = 200, contentType = "application/json") => {
      await route.fulfill({
        status,
        contentType,
        body: contentType === "application/json" ? JSON.stringify(body) : String(body)
      })
    }

    if (url.pathname === "/health" && method === "GET") {
      return respond({ status: "ok", service: "iwantjob-backend", message: "Backend is reachable" })
    }

    if (url.pathname === "/test-connection" && method === "GET") {
      return respond({ connected: true, message: "Supabase connection healthy" })
    }

    if (url.pathname === "/test-ai" && method === "GET") {
      return respond({ connected: true, message: "Model replied OK" })
    }

    if (url.pathname === "/save-application-draft" && method === "POST") {
      return respond({
        job: demoTrackerJob,
        qa_pairs: demoJobDetail.qa_pairs,
        resume_saved: true
      })
    }

    if (url.pathname === "/jobs" && method === "GET") {
      return respond([demoTrackerJob])
    }

    if (url.pathname === `/job/${demoTrackerJob.id}` && method === "GET") {
      return respond(demoJobDetail)
    }

    if (url.pathname === `/job/${demoTrackerJob.id}` && method === "DELETE") {
      return respond({ deleted: true })
    }

    if (url.pathname === "/generate-pdf" && method === "POST") {
      return respond("demo-pdf", 200, "application/pdf")
    }

    return respond({ detail: `No demo mock configured for ${method} ${url.pathname}` }, 404)
  })
}

export async function sendMessageToDemoTab(
  extensionPage: Page,
  targetUrlPrefix: string,
  type: string,
  payload: Record<string, unknown> = {}
) {
  return extensionPage.evaluate(
    async ({ targetUrlPrefix, type, payload }) => {
      const frameAware = type === "EXTRACT_FORM" || type === "AUTOFILL_FORM"

      const tabs = await chrome.tabs.query({})
      const target = tabs.find((tab) => tab.url?.startsWith(targetUrlPrefix))
      if (!target?.id) {
        throw new Error(`Could not find target tab for ${targetUrlPrefix}`)
      }

      const probeFormFrame = () => {
        const skipInputTypes = new Set(["hidden", "submit", "button", "reset", "image"])
        const controls = Array.from(
          document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
            "input, textarea, select"
          )
        )
        const usableControls = controls.filter((el) => {
          if (el instanceof HTMLInputElement && skipInputTypes.has(el.type)) return false
          return Boolean(el.offsetParent || el.getClientRects().length)
        })

        return {
          score: usableControls.length,
          totalControls: usableControls.length,
          url: window.location.href
        }
      }

      const manifest = chrome.runtime.getManifest()
      const contentScriptFile = manifest.content_scripts?.[0]?.js?.[0]
      if (!contentScriptFile) {
        throw new Error("Could not resolve content script file from manifest")
      }

      async function resolveFrameId(preferredFrameId?: number | null) {
        if (typeof preferredFrameId === "number") return preferredFrameId
        if (!frameAware) return undefined

        const probeResults = await chrome.scripting.executeScript({
          target: { tabId: target.id as number, allFrames: true },
          func: probeFormFrame
        })

        const candidate = probeResults
          .filter((entry) => entry.result && (entry.result as { score: number }).score > 0)
          .sort((left, right) => {
            const scoreDiff = ((right.result as { score: number } | undefined)?.score || 0)
              - (((left.result as { score: number } | undefined)?.score) || 0)
            if (scoreDiff !== 0) return scoreDiff
            return (left.frameId || 0) - (right.frameId || 0)
          })[0]

        return candidate?.frameId
      }

      async function send(frameId?: number) {
        const message = { type, ...payload }
        return typeof frameId === "number"
          ? chrome.tabs.sendMessage(target.id as number, message, { frameId })
          : chrome.tabs.sendMessage(target.id as number, message)
      }

      let frameId = await resolveFrameId((payload as { frame_id?: number | null }).frame_id)

      try {
        const response = await send(frameId)
        return frameAware ? { ...response, frame_id: frameId } : response
      } catch {
        await chrome.scripting.executeScript({
          target: frameAware ? { tabId: target.id as number, allFrames: true } : { tabId: target.id as number },
          files: [contentScriptFile]
        })
      }

      await new Promise((resolve) => setTimeout(resolve, 300))
      frameId = await resolveFrameId((payload as { frame_id?: number | null }).frame_id)
      const response = await send(frameId)
      return frameAware ? { ...response, frame_id: frameId } : response
    },
    { targetUrlPrefix, type, payload }
  )
}

export function buildDemoSeed(overrides: Record<string, unknown> = {}) {
  return {
    backend_url: demoBackendUrl,
    db_config: {
      supabase_url: "https://demo-project.supabase.co",
      supabase_key: "demo-service-role-key"
    },
    ai_config: {
      default: {
        provider: "deepseek",
        api_key: "demo-fill-key",
        model: "deepseek-chat"
      }
    },
    persona_text:
      "I care about useful product outcomes, clear communication, and shipping reliable systems that make complex workflows feel calm and understandable.",
    base_resume_text: "Demo base resume text",
    base_resume_json: demoResumeJson,
    ...overrides
  }
}

export function buildTailoredContext() {
  return {
    phase: "tailored",
    persistence_state: "draft",
    job_id: null,
    job_description: demoJobDescription,
    company: "Northstar Labs",
    job_title: "Full Stack Product Engineer",
    job_url: `${demoBaseUrl}/job-posting.html`,
    page_title: "Full Stack Product Engineer at Northstar Labs",
    page_excerpt:
      "Northstar Labs builds internal tooling and AI-assisted workflow software for distributed revenue teams.",
    metadata_lines: [
      "Location: Singapore",
      "Work mode: Remote",
      "Employment type: Full-time",
      "Salary: USD 4,000-6,500 / month"
    ],
    tailored_resume_json: demoResumeJson,
    draft_qa_pairs: demoAnswers.map(({ field_id, label, answer, field_type }) => ({
      field_id,
      label,
      answer,
      field_type
    }))
  }
}

export function buildResumeSession() {
  return {
    phase: "tailored",
    jobId: null,
    jdText: demoJobDescription,
    company: "Northstar Labs",
    jobTitle: "Full Stack Product Engineer",
    jobUrl: `${demoBaseUrl}/job-posting.html`,
    pageTitle: "Full Stack Product Engineer at Northstar Labs",
    pageExcerpt:
      "Northstar Labs builds internal tooling and AI-assisted workflow software for distributed revenue teams.",
    metadataLines: [
      "Location: Singapore",
      "Work mode: Remote",
      "Employment type: Full-time"
    ],
    tailoredJson: demoResumeJson,
    matchScore: 92,
    inFlightRequest: null
  }
}

export function buildFillFormSession(fields: unknown[]) {
  return {
    phase: "answered",
    fields,
    answers: demoAnswers,
    fieldCount: fields.length,
    includedFlaggedFieldIds: [],
    inFlightRequest: null
  }
}

export function getDemoAnswers() {
  return demoAnswers
}
