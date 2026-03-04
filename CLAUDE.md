# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## What This Project Is

**IWantJob** is an open-source Chrome extension that helps job seekers:
1. Tailor their resume to a specific job description (AI-generated, downloadable PDF)
2. Fill in application forms (AI reads the form, generates answers, user copy-pastes)
3. Save every Q&A pair from every form fill so they can reference it later
4. Track all applications in a built-in spreadsheet (inside the extension)
5. View a full job detail record per application: JD + tailored resume + form Q&A + chat
6. Chat with an AI career coach in context of a specific job

Users bring their own AI API key (OpenAI, Anthropic, Gemini, or Ollama locally). All data goes into the user's own Supabase DB. No SaaS, no subscriptions, fully open source (MIT).

Full specs: `docs/PRD.md` (product requirements) and `docs/SRS.md` (technical spec with DB schema, API contracts, prompts).

---

## Architecture (3 components)

```
Chrome Extension  ──HTTPS──►  FastAPI Backend  ──►  Supabase DB
(Plasmo + React)              (Docker / cloud)       (user-owned)
                                     │
                                     ▼
                               LiteLLM (AI abstraction)
                               OpenAI / Anthropic / Gemini / Ollama
```

The extension has **no direct DB access** — all DB operations go through the backend.
The backend **never stores API keys** — they're passed per-request in `X-API-Key` header.

---

## Tech Stack (do not change without good reason)

| Layer | Choice |
|-------|--------|
| Extension framework | **Plasmo** (not vanilla CRX, not CRXJS) |
| Extension UI | **React + TypeScript** |
| Extension styling | **Tailwind CSS** |
| Backend | **FastAPI** (Python 3.11+) |
| AI abstraction | **LiteLLM** — use this for ALL AI calls, never call OpenAI/Anthropic SDK directly |
| PDF generation | **WeasyPrint** |
| Database | **Supabase** (PostgreSQL) |
| Resume parsing | **pdfplumber** |
| Containers | **Docker + Docker Compose** |

---

## Development Commands

```bash
# Backend
cd backend
docker compose up                    # Run backend + dependencies
docker compose up --build            # Rebuild after code changes
# Backend runs on http://localhost:8000
# API docs at http://localhost:8000/docs (Swagger UI)

# Extension
cd extension
npm install                          # Install dependencies
npm run dev                          # Dev build with hot reload
npm run build                        # Production build
# Load unpacked from extension/build/chrome-mv3-dev in chrome://extensions
# Enable "Developer mode" first

# Database
# Apply migrations via Supabase Dashboard SQL editor or CLI:
# supabase db push (if using Supabase CLI)
```

---

## Key Decisions & Conventions

### Extension navigation
- The **Tracker tab** has two states: overview (`TrackerTable`) and detail (`JobDetail`)
- State is managed by `selectedJobId: string | null` — null = show table, uuid = show detail
- No URL routing needed inside the side panel

### Form Q&A saving
- `POST /fill-form` **automatically saves Q&A pairs** to the DB (don't make saving a separate user action)
- Q&A pairs are upserted by `(job_id, field_id)` — the unique key
- If save fails, buffer in `chrome.storage.local` under key `pending_qa_pairs` and retry on next open

### AI calls
- **Always use LiteLLM** — never import `openai` or `anthropic` SDKs directly in backend code
- Prompt templates live in `backend/app/prompts/*.txt` — load at runtime, don't hardcode in Python
- Form fill prompt must return **only valid JSON** — no preamble, no markdown fences

### Database
- All tables have `user_id` for multi-user safety even in self-hosted single-user mode
- `form_qa_pairs` cascades on job delete
- `pdf_url` values expire after 24 hours — never treat them as permanent

### Security
- API keys: `chrome.storage.local` only — passed in `X-API-Key` header per request
- Backend: validate + sanitize all HTML input before passing to AI
- No telemetry, no analytics, no logging of user content

---

## Backend API — Quick Reference

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/tailor-resume` | Generate tailored resume from JD + base resume |
| POST | `/fill-form` | Generate form answers + auto-save Q&A pairs |
| POST | `/save-qa` | Explicitly save/update Q&A pairs (for user edits) |
| GET | `/job/:id` | Fetch full job detail (job + JD + resume + Q&As + chat) |
| POST | `/log-job` | Create or update a job entry |
| POST | `/chat` | Chat message with job context |
| POST | `/generate-pdf` | Convert resume text to downloadable PDF |

Full request/response schemas are in `docs/SRS.md` Section 3.

---

## Database — Quick Reference

| Table | Purpose |
|-------|---------|
| `users` | Profile + base resume text |
| `jobs` | One row per job application |
| `form_qa_pairs` | All Q&A pairs per job (core feature) |
| `resumes` | Base + tailored resume versions |
| `chat_messages` | Chat history per job |

Full SQL schemas are in `/SRS.md` Section 4.

---

## V1 Scope — What to Build

Do NOT build beyond this list for V1:
- [ ] Content script: JD detection + form field extraction
- [ ] Side panel: 4-tab layout (Fill Form, Resume, Tracker, Chat)
- [ ] Resume tailoring → PDF download
- [ ] Form fill → copy-paste answers → auto-save Q&A to DB
- [ ] Tracker overview table (all jobs, clickable rows)
- [ ] Job Detail View (JD + resume + Q&A + chat per job)
- [ ] AI chatbot with job context (JD + resume + saved Q&As)
- [ ] Options page: base resume upload, API key, DB config

**Not in V1:** autofill, site-specific adapters, analytics, email automation, mobile
