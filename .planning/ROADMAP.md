# Roadmap: JobPilot

## Overview

JobPilot is built dependency-first. The database schema and scaffolding must exist before any service code can be written (Phase 1). Data plumbing — DB CRUD, the Options page, and base resume upload — must be operational before AI features have real inputs to work with (Phase 2). The AI service layer then builds all three AI features against real endpoints (Phase 3). Content scripts and the background service worker bridge the browser to the backend (Phase 4). With backend and content layer both functional, the four-tab React UI is assembled against live APIs (Phase 5). Finally, offline buffering and graceful degradation protect against the edge cases that only become visible after the happy path works end-to-end (Phase 6).

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Foundation** - Scaffolding for all three tiers with architecture boundaries enforced from day one (completed 2026-03-04)
- [ ] **Phase 2: Data Plumbing** - DB service layer, Options page, and non-AI backend endpoints operational
- [ ] **Phase 3: AI Core** - AI service layer with resume tailoring, form fill, chat, and PDF generation
- [ ] **Phase 4: Extension Content Layer** - Content scripts and background service worker bridge browser to backend
- [ ] **Phase 5: Extension UI** - All four side panel tabs fully functional end-to-end against live APIs
- [ ] **Phase 6: Resilience** - Offline buffering, error states, and graceful degradation across all edge cases

## Phase Details

### Phase 1: Foundation
**Goal**: Working empty shells exist for all three tiers with architecture boundaries enforced structurally
**Depends on**: Nothing (first phase)
**Requirements**: SETUP-01, SETUP-02, SETUP-03, SETUP-04
**Success Criteria** (what must be TRUE):
  1. Running `docker compose up` starts the FastAPI backend and returns a health check response at http://localhost:8000
  2. All 5 Supabase tables (users, jobs, form_qa_pairs, resumes, chat_messages) exist with RLS enabled and correct policies applied
  3. Loading the extension in Chrome opens a side panel with 4 tabs (Fill Form, Resume, Tracker, Chat) — all empty shells with no errors
  4. The extension project hot-reloads after code changes without rebuilding manually
**Plans**: 3 plans

Plans:
- [x] 01-01: Backend scaffolding — FastAPI app, Pydantic v2 schemas, Docker Compose with WeasyPrint system deps
- [x] 01-02: Database schema — all 5 tables, RLS policies, migrations via Supabase
- [ ] 01-03: Extension scaffolding — Plasmo project, 4-tab side panel shell, Tailwind config

### Phase 2: Data Plumbing
**Goal**: User can configure the extension and their data persists in Supabase through the backend API
**Depends on**: Phase 1
**Requirements**: CONFIG-01, CONFIG-02, CONFIG-03, CONFIG-04, CONFIG-05, API-03, API-04, API-05, API-08
**Success Criteria** (what must be TRUE):
  1. User can open the Options page and save an AI API key, backend URL, and Supabase credentials — settings persist after browser restart
  2. User can upload a base resume PDF on the Options page and the extracted plain text is stored
  3. User can fill in profile fields (name, email, LinkedIn, GitHub, work authorization) on the Options page
  4. POST /log-job creates a job entry in Supabase and GET /job/:id returns the full record
  5. All endpoints reject malformed input with a descriptive error rather than a 500
**Plans**: TBD

Plans:
- [ ] 02-01: Backend DB service — supabase-py v2 async client, CRUD for all 5 tables, user_id isolation
- [ ] 02-02: Non-AI endpoints — POST /log-job, GET /job/:id, POST /save-qa with Pydantic validation and input sanitization
- [ ] 02-03: Options page — base resume upload (pdfplumber), API key config, Supabase config, backend URL, user profile fields

### Phase 3: AI Core
**Goal**: All three AI features (resume tailoring, form fill, chat) work end-to-end against the backend with real prompts and validated JSON responses
**Depends on**: Phase 2
**Requirements**: RESUME-01, RESUME-02, RESUME-03, RESUME-04, RESUME-05, RESUME-06, RESUME-07, FORM-01, FORM-02, FORM-03, API-01, API-02, API-06, API-07, API-09, API-10
**Success Criteria** (what must be TRUE):
  1. POST /tailor-resume returns a tailored resume text that mirrors JD keywords and adjusts emphasis without fabricating experience
  2. POST /generate-pdf returns a downloadable PDF from resume text rendered via WeasyPrint
  3. POST /fill-form returns valid JSON with a generated answer per form field — no preamble or markdown fences in the response
  4. POST /chat returns a contextually relevant reply using JD, resume, and saved Q&A pairs
  5. All AI calls route through LiteLLM — calling the endpoint with an Anthropic key and with an OpenAI key both produce valid responses
**Plans**: TBD

Plans:
- [ ] 03-01: AI service layer — LiteLLM wrapper, prompt template loader (backend/app/prompts/*.txt), JSON enforcement (response_format + regex fallback + Pydantic validation)
- [ ] 03-02: Resume endpoints — POST /tailor-resume (tailoring + match score + auto-log job), POST /generate-pdf (WeasyPrint CSS tables/floats layout)
- [ ] 03-03: Form fill and chat endpoints — POST /fill-form (JSON-only response, Q&A auto-save), POST /chat (full job context)

### Phase 4: Extension Content Layer
**Goal**: The extension reliably detects JD pages and form pages on major job sites and delivers structured data to the side panel
**Depends on**: Phase 1
**Requirements**: DETECT-01, DETECT-02, DETECT-03, DETECT-04, DETECT-05
**Success Criteria** (what must be TRUE):
  1. Navigating to a job posting page causes the extension to detect and extract the JD text without user action — the text is available in chrome.storage.session
  2. Navigating to a job application form page causes the extension to extract a FormField[] array with label, type, options, and required fields — available in chrome.storage.session
  3. JD and form detection work on SPA-based job sites (where DOM content loads after the page load event)
  4. When no JD or form is auto-detected, the user can manually paste text as a fallback
  5. The background service worker reconstructs all needed state from chrome.storage on wake — no in-memory state is lost when the MV3 service worker is terminated
**Plans**: TBD

Plans:
- [ ] 04-01: JD content script — keyword-based JD detection, text extraction, MutationObserver for SPA support, chrome.storage.session write
- [ ] 04-02: Form content script — form field detection (3+ labeled inputs), FormField[] extraction with composite field IDs, MutationObserver for SPA support
- [ ] 04-03: Background service worker — stateless message router, chrome.storage management, manual paste fallback handler

### Phase 5: Extension UI
**Goal**: Users can use all four side panel tabs end-to-end — fill forms, tailor resumes, track applications, and chat with an AI coach — all backed by live APIs
**Depends on**: Phase 3, Phase 4
**Requirements**: FORM-04, FORM-05, TRACK-01, TRACK-02, TRACK-03, TRACK-04, TRACK-05, TRACK-06, DETAIL-01, DETAIL-02, DETAIL-03, DETAIL-04, DETAIL-05, CHAT-01, CHAT-02, CHAT-03, CHAT-04, CHAT-05
**Success Criteria** (what must be TRUE):
  1. User can click "Fill Form" in the side panel and see AI-generated answers for each detected form field, ready to copy-paste — Q&A pairs are automatically saved to DB after answers appear
  2. User can click "Tailor Resume" in the Resume tab and download a formatted PDF of the tailored resume
  3. Tracker tab shows a table of all applications with sortable columns, filterable by company/status/date, and inline status and notes editing
  4. Clicking any tracker row opens the Job Detail View showing the full record: JD, tailored resume with download, all Q&A pairs with inline editing, and chat history
  5. User can send a message in the Chat tab and receive an AI reply that references the specific job's JD, resume, and submitted Q&A pairs
**Plans**: TBD

Plans:
- [ ] 05-01: Fill Form tab — answer display UI (field label + answer + type), copy-paste affordance, Q&A auto-save trigger
- [ ] 05-02: Resume tab — tailoring trigger, tailored resume preview, PDF download button
- [ ] 05-03: Tracker tab — TrackerTable (sortable, filterable, inline status/notes editing), selectedJobId navigation state
- [ ] 05-04: Job Detail View — full record layout (JD collapsible, resume preview + download, Q&A panel with inline edit, chat history), prev/next navigation, back button
- [ ] 05-05: Chat tab — message input, response display, job-scoped chat history, AI context (JD + resume + Q&A pairs)

### Phase 6: Resilience
**Goal**: The extension handles backend unreachability, AI errors, and quota limits gracefully — no data is silently lost when things go wrong
**Depends on**: Phase 5
**Requirements**: FORM-06, FORM-07
**Success Criteria** (what must be TRUE):
  1. When the DB save after form fill fails, Q&A pairs are buffered in chrome.storage.local under pending_qa_pairs and the user sees a non-blocking notice
  2. Buffered Q&A pairs are automatically retried on next extension open and cleared from the buffer on success
**Plans**: TBD

Plans:
- [ ] 06-01: Offline Q&A buffer — chrome.alarms retry mechanism, stateless service worker compatible, storage quota guard, buffer cleared on successful retry

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6

Note: Phase 4 depends only on Phase 1 and can begin in parallel with Phase 2-3 if desired.

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 3/3 | Complete   | 2026-03-04 |
| 2. Data Plumbing | 0/3 | Not started | - |
| 3. AI Core | 0/3 | Not started | - |
| 4. Extension Content Layer | 0/3 | Not started | - |
| 5. Extension UI | 0/5 | Not started | - |
| 6. Resilience | 0/1 | Not started | - |
