# JobPilot

## What This Is

JobPilot is an open-source Chrome extension that helps job seekers apply faster and smarter. It reads job pages directly in the browser, uses AI to tailor resumes and fill application forms, tracks every application in a built-in spreadsheet, and stores a full record of every Q&A submitted — all without leaving the browser. Users bring their own AI API key and database. No SaaS, no subscriptions.

## Core Value

Every job application is fully recorded and retrievable — the JD, the tailored resume, every form answer, and all coaching chat — so the user never loses track of what they applied to or what they wrote.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Content script detects JD pages and form pages automatically
- [ ] Side panel with 4-tab layout: Fill Form, Resume, Tracker, Chat
- [ ] AI resume tailoring from JD + base resume, downloadable as PDF
- [ ] AI form fill with copy-paste answers, Q&A auto-saved to DB
- [ ] Application tracker table (all jobs, sortable, filterable, clickable rows)
- [ ] Job Detail View: JD + tailored resume + form Q&A + chat history per job
- [ ] AI chatbot with full job context (JD + resume + saved Q&As)
- [ ] Options page: base resume upload, API key config, DB connection setup
- [ ] User profile fields: name, contact, LinkedIn, GitHub, work authorization
- [ ] Offline Q&A buffering in chrome.storage.local with retry on reconnect
- [ ] Backend API: tailor-resume, fill-form, save-qa, log-job, chat, generate-pdf, job/:id
- [ ] Database schema: users, jobs, form_qa_pairs, resumes, chat_messages

### Out of Scope

- Automatic form submission (autofill) — V2, user always reviews before submitting
- Site-specific adapters (Greenhouse, Lever, Workday) — V2
- OAuth/LinkedIn/Indeed integrations — V2+
- Application analytics and response rate tracking — V3
- Team/collaborative features — not planned
- Mobile app — not planned
- Built-in AI model — users bring their own key
- Email follow-up automation — not planned
- Telemetry, analytics, or usage tracking — by design

## Context

- Comprehensive PRD (`docs/PRD.md`) and SRS (`docs/SRS.md`) already written with full API specs, DB schema, prompt templates, and file structure
- Codebase map exists at `.planning/codebase/` from initial mapping
- Target users: active job seekers applying to 5–50+ jobs/month
- The extension has no direct DB access — all DB operations go through the backend
- The backend never stores API keys — they're passed per-request in `X-API-Key` header
- Form Q&A pairs are upserted by `(job_id, field_id)` unique key
- PDF URLs expire after 24 hours — never treat as permanent
- Tracker tab uses `selectedJobId` state (null = table, uuid = detail view) — no URL routing

## Constraints

- **Tech stack**: Plasmo (extension framework), React + TypeScript (UI), Tailwind CSS (styling), FastAPI (backend), LiteLLM (AI abstraction — never call provider SDKs directly), WeasyPrint (PDF), Supabase/PostgreSQL (DB), pdfplumber (resume parsing), Docker (deployment)
- **AI calls**: Always through LiteLLM — never import openai or anthropic SDKs directly
- **Prompt templates**: Must live in `backend/app/prompts/*.txt` — loaded at runtime, not hardcoded
- **Form fill response**: Must return only valid JSON — no preamble, no markdown fences
- **Security**: API keys in chrome.storage.local only, no telemetry, no logging of user content, sanitize all HTML input before passing to AI
- **Database**: All tables have `user_id` for multi-user safety, `form_qa_pairs` cascades on job delete

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Plasmo over vanilla CRX/CRXJS | Hot reload, React/TS support, MV3 compliant | — Pending |
| LiteLLM for all AI calls | Single interface for OpenAI/Anthropic/Gemini/Ollama | — Pending |
| User-owned Supabase DB | No vendor lock-in, user controls their data | — Pending |
| Copy-paste form fill (not autofill) for V1 | Lower complexity, user reviews every answer | — Pending |
| WeasyPrint for PDF | HTML/CSS → PDF, clean resume output, open source | — Pending |
| Side panel (not popup) for main UI | More screen real estate for complex views | — Pending |

---
*Last updated: 2026-03-04 after initialization*
