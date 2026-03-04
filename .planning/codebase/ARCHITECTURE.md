# Architecture

**Analysis Date:** 2026-03-04

## Pattern Overview

**Overall:** Distributed multi-tier architecture with strict separation between extension UI and backend logic. Extension communicates with backend exclusively over HTTPS; backend never stores API keys or sensitive data.

**Key Characteristics:**
- Extension (Plasmo + React) is stateless — all business logic delegated to backend
- Backend (FastAPI) is AI-orchestration layer with database access
- Database (Supabase PostgreSQL) is user-owned — extension/backend never hard-code credentials
- AI calls always go through LiteLLM abstraction layer (never direct SDK calls)
- API keys flow via `X-API-Key` header per-request; never persisted server-side

## Layers

**Chrome Extension Layer:**
- Purpose: User-facing interface, page content extraction, form field detection, request orchestration
- Location: `extension/src/`
- Contains: React components (TSX), content scripts, background service worker, popup, options page
- Depends on: Backend API, chrome.storage.local (for credentials), browser DOM APIs
- Used by: End users in Chrome browser

**Backend Service Layer:**
- Purpose: AI orchestration, resume/form processing, database operations, PDF generation
- Location: `backend/app/`
- Contains: FastAPI routers, service classes (AI, PDF, DB), Pydantic request/response schemas, prompt templates
- Depends on: LiteLLM (AI abstraction), Supabase client, WeasyPrint (PDF), pdfplumber (PDF parsing)
- Used by: Chrome extension via HTTPS

**Data Persistence Layer:**
- Purpose: Multi-user data storage with strict isolation by user_id
- Location: Supabase PostgreSQL (external service)
- Contains: users, jobs, form_qa_pairs, resumes, chat_messages tables
- Depends on: No dependencies (terminal layer)
- Used by: Backend service layer only

**AI Provider Layer:**
- Purpose: Language model execution
- Location: External (OpenAI, Anthropic, Gemini, Ollama)
- Contains: No code in this repo — abstracted via LiteLLM
- Depends on: User's API key (passed per-request in `X-API-Key` header)
- Used by: Backend AI service via LiteLLM

## Data Flow

**Resume Tailoring Flow:**

1. User navigates to job page with JD
2. Content script detects JD text, sends to background service worker
3. Background worker stores JD in `chrome.storage.session` as `current_job`
4. User opens extension → Resume tab → clicks "Tailor Resume"
5. React component reads JD from `chrome.storage.session` and user's base resume from `chrome.storage.local`
6. Component calls `POST /tailor-resume` to backend with JD + base resume
7. Backend loads `tailor_resume.txt` prompt template
8. Backend calls LiteLLM with prompt + JD + base resume + user's AI key (from `X-API-Key` header)
9. LiteLLM routes to user's chosen provider (OpenAI/Anthropic/Ollama)
10. Backend receives tailored resume text, generates PDF via WeasyPrint
11. Backend returns `{ tailored_resume_text, pdf_url, match_score }` to extension
12. Extension displays preview and download button
13. User downloads PDF (expires after 24 hours)

**Form Fill + Q&A Save Flow:**

1. User navigates to application form page
2. Content script extracts form fields (`<input>`, `<textarea>`, `<select>`) with labels, types, required flags
3. Content script sends FormField array to background service worker
4. User opens extension → Fill Form tab → clicks "Analyze Form"
5. React component calls `POST /fill-form` with:
   - Form fields array
   - User's resume text from `chrome.storage.local`
   - User profile (name, email, work auth) from `chrome.storage.local`
   - Current job_id (if available) from `chrome.storage.session`
   - Job description (if available)
6. Backend loads `fill_form.txt` prompt template
7. Backend calls LiteLLM to generate answers — receives JSON array of `{ field_id, label, answer, field_type }`
8. Backend **automatically upserts Q&A pairs** into `form_qa_pairs` table (keyed by `job_id, field_id`)
9. Backend returns answers + `qa_saved: true` to extension
10. Extension displays answers in table for copy-paste
11. If save fails, extension buffers in `chrome.storage.local` under `pending_qa_pairs` and retries on next open

**Job Detail View Fetch Flow:**

1. User clicks a job row in Tracker overview (TrackerTable)
2. React sets `selectedJobId` state to job UUID
3. JobDetail component mounts and calls `GET /job/:id`
4. Backend queries:
   - Job metadata (company, title, status, URL, notes)
   - Job description text
   - Tailored resume text + PDF URL
   - All form_qa_pairs rows for this job
   - Chat message history for this job
5. Backend returns unified object to extension
6. JobDetail component renders all sections: JD, resume, Q&A table (with edit capability), chat history
7. If user edits a Q&A answer, click save calls `POST /save-qa` with updated pairs
8. Backend upserts with `edited_by_user: true` flag

**Chat with Job Context Flow:**

1. User is in Job Detail View or Chat tab
2. User types message and hits send
3. Extension calls `POST /chat` with:
   - Message text
   - job_id (current job context)
   - Current conversation history (array of `{ role, content }`)
   - Context object: resume text, job description, saved Q&A pairs
4. Backend loads `chat_coach.txt` prompt template with context
5. Backend calls LiteLLM with full context
6. Backend receives assistant response
7. Backend saves both user message and assistant response to `chat_messages` table
8. Backend returns response to extension
9. Extension appends to chat history and displays

**State Management:**

Chrome extension state lives in multiple chrome.storage scopes:

- `chrome.storage.local`: User profile, AI config, DB config, pending_qa_pairs (persists across sessions)
- `chrome.storage.session`: current_job (JD + form fields, cleared on tab close)

Backend is **stateless** — no session state. Each request is independent. Requests include all necessary context (job_id, resume text, form fields, chat history). User's AI API key is sent per-request in `X-API-Key` header; backend never stores it.

## Key Abstractions

**FormField Interface:**
- Purpose: Standardized representation of form input, textarea, select, checkbox, radio elements
- Location: Extracted by content script (`extension/src/contents/content_script.ts`), passed to backend, stored partially in form_qa_pairs
- Pattern: Content script generates per-field: `{ field_id, label, name, type, options?, required, placeholder? }`

**LiteLLM Service:**
- Purpose: Single abstraction layer for all AI providers (OpenAI, Anthropic, Gemini, Ollama)
- Location: `backend/app/services/ai_service.py`
- Pattern: Wrapper around `litellm.completion()` that accepts provider/model name from config, user's API key, and returns consistent response format

**Database Service:**
- Purpose: Supabase client wrapper for CRUD operations on users, jobs, form_qa_pairs, etc.
- Location: `backend/app/services/db_service.py`
- Pattern: Methods like `save_job()`, `fetch_job_with_context()`, `upsert_qa_pairs()` that handle user_id isolation and cascade deletes

**Prompt Templates:**
- Purpose: Decoupled prompts from Python code — allows updates without redeploying
- Location: `backend/app/prompts/*.txt` (three files: tailor_resume.txt, fill_form.txt, chat_coach.txt)
- Pattern: Plain text files loaded at runtime; variables injected as `{variable_name}` placeholders

## Entry Points

**Extension Content Script:**
- Location: `extension/src/contents/content_script.ts`
- Triggers: Automatically on every page load (runs in isolated world)
- Responsibilities: Detect if page is JD or form, extract JD text or form fields, send to background service worker

**Extension Background Service Worker:**
- Location: `extension/src/background/background.ts`
- Triggers: Extension startup, messages from content scripts, messages from side panel
- Responsibilities: Route requests to backend API, manage chrome.storage state, coordinate between content script and UI

**Extension Side Panel Root:**
- Location: `extension/src/sidepanel/index.tsx`
- Triggers: User clicks extension icon
- Responsibilities: Render 4-tab layout, manage `selectedJobId` state for Tracker navigation, pass data to child tabs

**Backend Main Entry:**
- Location: `backend/app/main.py`
- Triggers: Container startup or local `python -m uvicorn` command
- Responsibilities: FastAPI app initialization, CORS configuration, router registration, middleware setup

**Backend Routers:**
- Location: `backend/app/routers/` (resume.py, form.py, jobs.py, chat.py)
- Triggers: HTTP requests to matching endpoints
- Responsibilities: Parse request, validate input, orchestrate services, return responses

## Error Handling

**Strategy:** Graceful degradation with buffering for offline scenarios.

**Patterns:**

1. **AI Provider Errors (timeout, rate limit, invalid key):**
   - Backend returns HTTP 4xx/5xx with error message
   - Extension shows error in side panel with "Retry" button
   - User can investigate API key or provider status
   - No automatic retry (let user take action)

2. **Database Connection Failures:**
   - `POST /fill-form`: Q&A pairs buffered locally in `pending_qa_pairs`
   - `POST /save-qa`: Updated answers buffered locally
   - Extension shows toast "Saved locally — will sync when connection restored"
   - On extension re-open, background worker retries sync
   - No user action required

3. **Missing Content (No JD detected, no form found):**
   - Content script detects neutral page state
   - Extension shows "No job content detected" message
   - Offers fallback: paste JD or form fields manually into modal

4. **Backend Offline (connection refused):**
   - Extension shows "Backend is offline" banner
   - Offers link to `docker compose up` in local setup guide
   - If using cloud deployment, suggests checking deployment status
   - Offline Tracker view still readable (cached data)

5. **PDF Generation Failure:**
   - Backend falls back to plain text download
   - Extension shows toast "PDF unavailable — download as text"

6. **Form Field Extraction Errors (DOM changed after extraction):**
   - Content script re-scans on form change event
   - Extension calls backend again with new field list
   - User sees updated answer list

## Cross-Cutting Concerns

**Logging:**
- Backend logs to stdout (captured by Docker/deployment platform)
- Never logs user content, API keys, or form answers
- Log level: DEBUG in development, INFO in production
- Use FastAPI middleware for request/response timing

**Validation:**
- Pydantic models in `backend/app/models/schemas.py` validate all request shapes
- Backend sanitizes HTML/rich text input before passing to AI (strip tags, escape quotes)
- Extension validates form field extraction (required fields present, types recognized)

**Authentication:**
- No persistent auth — API key passed per-request in `X-API-Key` header
- Backend accepts any key format (OpenAI, Anthropic, Ollama local assumes valid)
- No token/JWT — stateless per-request model
- HTTPS required in production; localhost HTTP allowed in development

**Rate Limiting:**
- Not explicitly implemented in V1
- Relies on downstream AI provider rate limits
- If provider returns 429, extension shows error with guidance

**Privacy:**
- Backend never logs, stores, or caches API keys
- Database stores user profile and job/resume text only (with user_id for multi-tenant safety)
- PDFs stored temporarily with 24-hour TTL
- No telemetry, analytics, or tracking of any kind
- All user data deletable via cascade delete on users table

---

*Architecture analysis: 2026-03-04*
