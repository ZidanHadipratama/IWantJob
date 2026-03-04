# Architecture Patterns

**Project:** JobPilot
**Researched:** 2026-03-04
**Confidence:** HIGH (derived from project's own SRS, PRD, and codebase analysis documents)

---

## Recommended Architecture

Three-tier distributed architecture with strict unidirectional dependency rule: extension never touches the database directly, backend never persists user secrets.

```
┌─────────────────────────────────────────────────────────┐
│                  Chrome Extension                        │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │ Content     │  │  Background  │  │  Side Panel   │  │
│  │ Script      │─►│  Service     │◄─│  (React UI)   │  │
│  │ (DOM read)  │  │  Worker      │  │  4-tab layout │  │
│  └─────────────┘  └──────┬───────┘  └───────────────┘  │
│                           │                              │
│         chrome.storage.local / chrome.storage.session    │
└───────────────────────────┼──────────────────────────────┘
                            │ HTTPS (X-API-Key header)
                            ▼
┌─────────────────────────────────────────────────────────┐
│                   FastAPI Backend                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │  Routers     │  │  Services    │  │  Prompts     │  │
│  │  (endpoints) │─►│  AI/PDF/DB   │  │  (*.txt)     │  │
│  └──────────────┘  └──────┬───────┘  └──────────────┘  │
│                    ┌───────┴────────┐                    │
│                    │   LiteLLM      │                    │
│                    └───────┬────────┘                    │
└────────────────────────────┼────────────────────────────┘
                             │
              ┌──────────────┴──────────────┐
              ▼                             ▼
  ┌──────────────────┐          ┌─────────────────────────┐
  │  Supabase DB     │          │  AI Providers           │
  │  (user-owned)    │          │  OpenAI / Anthropic /   │
  │                  │          │  Gemini / Ollama        │
  └──────────────────┘          └─────────────────────────┘
```

---

## Component Boundaries

| Component | Responsibility | Communicates With | Does NOT Touch |
|-----------|---------------|-------------------|----------------|
| Content Script | Detect JD/form pages; extract DOM text and form fields | Background Worker (chrome.runtime.sendMessage) | Backend, DB, Side Panel |
| Background Service Worker | Route messages; relay API requests to backend; buffer offline Q&A | Content Script, Side Panel, Backend API, chrome.storage | DB directly |
| Side Panel (React UI) | Render 4-tab layout; display AI results; manage selectedJobId state | Background Worker, chrome.storage.local | Backend directly |
| Options Page | Capture resume, API key, DB config; write to chrome.storage.local | chrome.storage.local only | Backend, DB |
| FastAPI Routers | Parse/validate HTTP requests; orchestrate services; return responses | Services (AI, PDF, DB) | Extension internals |
| AI Service | Wrap LiteLLM; load prompt templates; call AI provider | LiteLLM, prompt .txt files | DB, PDF service |
| PDF Service | Generate PDF from resume text via WeasyPrint | WeasyPrint library | AI service, DB |
| DB Service | CRUD on Supabase; enforce user_id isolation; handle upserts | Supabase PostgreSQL | AI service, PDF service |

### Critical Boundary Rules

1. Extension never calls Supabase directly — all DB access through FastAPI backend
2. Backend never stores user's AI API key — received in X-API-Key header, forwarded to LiteLLM, discarded
3. AI calls never use provider SDKs directly — always through ai_service.py → LiteLLM
4. Prompt text never lives in Python files — loaded from `backend/app/prompts/*.txt` at runtime
5. Side panel communicates with backend through the background service worker

---

## Data Flows

### Resume Tailoring Flow

```
User on job page → Content Script detects JD → stores in chrome.storage.session
    → User clicks "Tailor Resume" in Side Panel
    → Side Panel sends to Background Worker
    → Background Worker → POST /tailor-resume (X-API-Key header)
    → resume.py → ai_service.py (loads tailor_resume.txt, calls litellm.completion)
    → LiteLLM → AI provider → tailored_resume_text
    → pdf_service.py → WeasyPrint → PDF (24h TTL)
    → Response: { tailored_resume_text, pdf_url, match_score }
    → Side Panel shows preview + download button
```

### Form Fill + Auto-Save Flow

```
User on form page → Content Script extracts FormField[]
    → stores in chrome.storage.session
    → User clicks "Analyze Form" in Fill Form tab
    → Side Panel → Background Worker → POST /fill-form
    → form.py → ai_service.py (loads fill_form.txt, JSON-only response)
    → form.py → db_service.py (upsert form_qa_pairs by job_id + field_id)
    → Response: { answers: [...], qa_saved: true/false }
    → If qa_saved == false: buffer in chrome.storage.local["pending_qa_pairs"]
    → Side Panel shows copy-paste answer table
```

### Job Detail Fetch Flow

```
User clicks row in TrackerTable → selectedJobId = <uuid>
    → JobDetail component mounts → GET /job/:id
    → jobs.py → db_service.py (parallel queries: job metadata, JD, resume, Q&As, chat)
    → Returns unified JobDetailResponse
    → JobDetail renders: JD section, Resume section, QAPanel, Chat history
```

### Chat Flow

```
User types message in Chat tab
    → POST /chat { message, job_id, history[], context: { resume, jd, qa_pairs } }
    → chat.py → ai_service.py (loads chat_coach.txt, injects full context)
    → LiteLLM → AI provider → assistant response
    → chat.py → db_service.py (saves both user + assistant messages)
    → Response: { response: "..." }
    → Side Panel appends to chat display
```

---

## State Management

```
chrome.storage.local (persists across sessions):
    user_profile:      { name, email, linkedin, github, work_auth }
    ai_config:         { provider, api_key, model, backend_url }
    db_config:         { supabase_url, anon_key }
    pending_qa_pairs:  [ { job_id, field_id, label, answer } ]  ← offline buffer

chrome.storage.session (cleared on browser close):
    current_job: { jd_text, form_fields[], job_id? }  ← active page context

Backend (stateless — nothing persisted between requests):
    No session state. Each request self-contained.
```

---

## Patterns to Follow

1. **Stateless backend per request** — each API call includes all needed context (job_id, resume, form fields, history, API key)
2. **LiteLLM abstraction** — all AI calls through ai_service.py → litellm.completion()
3. **Prompt templates as runtime files** — load from `backend/app/prompts/*.txt`, inject variables
4. **Upsert Q&A by composite key** — (job_id, field_id) prevents duplicates
5. **Offline buffering with retry** — failed DB saves → chrome.storage.local buffer → retry on next open
6. **selectedJobId navigation** — null = TrackerTable, uuid = JobDetail, no react-router needed

---

## Anti-Patterns to Avoid

1. **Direct DB access from extension** — leaks credentials, bypasses validation
2. **Direct AI SDK calls** — breaks multi-provider support, violates LiteLLM abstraction
3. **Hardcoded prompts in Python** — must load from .txt files
4. **Storing API keys server-side** — contradicts BYOK model
5. **Permanent PDF URL references** — 24h TTL means links expire
6. **Autofill/DOM write from content script V1** — brittle, no user review

---

## Build Order (Dependency-Driven)

```
Phase 1: Foundation
├── DB schema + Supabase migrations
├── Backend scaffolding: FastAPI app, Pydantic schemas, Docker
└── Extension scaffolding: Plasmo project, TypeScript, Tailwind, 4-tab shell

Phase 2: Data Plumbing
├── Backend DB service: CRUD for users, jobs, form_qa_pairs
├── Backend endpoints: POST /log-job, GET /job/:id, POST /save-qa
└── Extension Options page: user profile + API key + DB config

Phase 3: AI Core
├── Backend AI service: LiteLLM wrapper + prompt template loader
├── POST /tailor-resume + POST /fill-form + POST /chat
├── POST /generate-pdf (WeasyPrint)
└── Prompt template files

Phase 4: Extension Content Layer
├── Content script: JD detection + text extraction
├── Content script: Form field detection + FormField[] extraction
└── Background service worker: message routing + chrome.storage

Phase 5: Extension UI
├── Fill Form tab + Resume tab
├── Tracker tab: TrackerTable + JobDetail + QAPanel
└── Chat tab

Phase 6: Resilience
├── Offline Q&A buffering + retry
├── Error states: backend offline, AI errors, missing JD fallback
└── PDF URL expiry handling
```

---

## Sources

- .planning/codebase/ARCHITECTURE.md — Codebase analysis (HIGH confidence)
- .planning/codebase/STRUCTURE.md — Directory conventions (HIGH confidence)
- CLAUDE.md — Architecture decisions and constraints (HIGH confidence)
- docs/SRS.md — Full technical specification (HIGH confidence)

---

*Architecture research: 2026-03-04*
