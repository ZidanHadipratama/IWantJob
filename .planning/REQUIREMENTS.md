# Requirements: JobPilot

**Defined:** 2026-03-04
**Core Value:** Every job application is fully recorded and retrievable — the JD, the tailored resume, every form answer, and all coaching chat

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Foundation & Setup

- [x] **SETUP-01**: Backend scaffolding with FastAPI, Pydantic v2 schemas, Docker Compose, CORS for chrome-extension origins
- [x] **SETUP-02**: Database schema with all 5 tables (users, jobs, form_qa_pairs, resumes, chat_messages) and RLS policies
- [x] **SETUP-03**: Extension scaffolding with Plasmo, React, TypeScript, Tailwind, 4-tab side panel shell
- [x] **SETUP-04**: Docker Compose one-command setup (`docker compose up`) for backend + dependencies

### Content Detection

- [ ] **DETECT-01**: Content script detects JD pages by identifying long text blocks with job-related keywords (responsibilities, requirements, qualifications)
- [ ] **DETECT-02**: Content script detects form pages by identifying `<form>` elements with 3+ labeled inputs
- [ ] **DETECT-03**: Content script extracts JD text and stores in chrome.storage.session
- [ ] **DETECT-04**: Content script extracts FormField[] (field_id, label, name, type, options, required, placeholder) and stores in chrome.storage.session
- [ ] **DETECT-05**: Manual paste fallback when no JD or form is detected on the page

### Resume Tailoring

- [ ] **RESUME-01**: User can upload base resume as PDF, parsed to plain text via pdfplumber
- [ ] **RESUME-02**: User can trigger AI resume tailoring from JD + base resume via POST /tailor-resume
- [ ] **RESUME-03**: AI reorders skills, adjusts summary, emphasizes relevant experience, mirrors JD keywords — without fabricating experience
- [ ] **RESUME-04**: User can preview tailored resume text in the Resume tab of the side panel
- [ ] **RESUME-05**: User can download tailored resume as a formatted PDF via WeasyPrint
- [ ] **RESUME-06**: Tailored resume is saved to DB linked to the job entry
- [ ] **RESUME-07**: Job is auto-logged to tracker as "Saved" when resume is first tailored

### Form Assistant

- [ ] **FORM-01**: User can trigger form analysis from Fill Form tab, sending extracted FormField[] to POST /fill-form
- [ ] **FORM-02**: AI generates answers for each form field using resume, user profile, and JD context
- [ ] **FORM-03**: Form fill response returns only valid JSON — no preamble, no markdown fences
- [ ] **FORM-04**: Answers are displayed in side panel with field label, answer text, and field type for copy-paste
- [ ] **FORM-05**: All Q&A pairs are automatically saved to DB via upsert on (job_id, field_id) — no separate user action needed
- [ ] **FORM-06**: If DB save fails, Q&A pairs are buffered in chrome.storage.local under pending_qa_pairs key
- [ ] **FORM-07**: Buffered Q&A pairs are retried on next extension open

### Application Tracker

- [ ] **TRACK-01**: Tracker tab shows spreadsheet-style table of all jobs with columns: Company, Title, URL, Date Applied, Status, # Q&As, Resume Tailored?, Notes
- [ ] **TRACK-02**: User can click any row to open Job Detail View
- [ ] **TRACK-03**: User can update job status via inline dropdown (Saved → Applied → Phone Screen → Interview → Offer → Rejected → Withdrawn)
- [ ] **TRACK-04**: User can edit notes inline in the tracker table
- [ ] **TRACK-05**: User can search/filter jobs by company, status, or date range
- [ ] **TRACK-06**: User can sort tracker table by any column header

### Job Detail View

- [ ] **DETAIL-01**: Job Detail View shows full record: header (company, title, status, date, URL), collapsible JD text, tailored resume preview + download, all Q&A pairs, chat history, and notes
- [ ] **DETAIL-02**: User can edit any Q&A answer inline, with edited_by_user flag tracked via POST /save-qa
- [ ] **DETAIL-03**: Back button returns to Tracker overview
- [ ] **DETAIL-04**: Prev/Next arrows navigate between jobs without returning to tracker list
- [ ] **DETAIL-05**: Status dropdown in header allows updating status directly from detail view

### AI Chat Coach

- [ ] **CHAT-01**: User can send messages in Chat tab, scoped to the current job
- [ ] **CHAT-02**: AI has full context: JD, tailored resume, and saved Q&A pairs for that job
- [ ] **CHAT-03**: AI provides interview prep — likely questions based on JD and user's submitted answers
- [ ] **CHAT-04**: Full chat history is stored per job in chat_messages table
- [ ] **CHAT-05**: Chat history is visible in Job Detail View

### Settings & Configuration

- [ ] **CONFIG-01**: Options page allows user to upload base resume (PDF)
- [ ] **CONFIG-02**: Options page allows user to set AI provider, API key, and model name — stored in chrome.storage.local
- [ ] **CONFIG-03**: Options page allows user to set backend URL (default: http://localhost:8000)
- [x] **CONFIG-04**: Options page allows user to connect Supabase DB via URL + anon key
- [ ] **CONFIG-05**: Options page allows user to fill profile fields: name, email, LinkedIn, GitHub, work authorization

### Backend API

- [ ] **API-01**: POST /tailor-resume — generates tailored resume from JD + base resume, returns text + PDF URL + match score
- [ ] **API-02**: POST /fill-form — generates form answers + auto-saves Q&A pairs to DB
- [ ] **API-03**: POST /save-qa — explicitly saves/updates Q&A pairs (for user edits in Job Detail View)
- [ ] **API-04**: GET /job/:id — fetches full job detail (job metadata + JD + tailored resume + Q&A pairs + chat history)
- [ ] **API-05**: POST /log-job — creates or updates a job entry
- [ ] **API-06**: POST /chat — sends chat message with job context, saves to DB
- [ ] **API-07**: POST /generate-pdf — converts resume text to PDF via WeasyPrint with 24h TTL
- [x] **API-08**: All endpoints validate and sanitize input before passing to AI
- [ ] **API-09**: AI calls use LiteLLM exclusively — no direct provider SDK imports
- [ ] **API-10**: Prompt templates loaded from backend/app/prompts/*.txt at runtime

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Autofill

- **AUTOFILL-01**: One-click form autofill with user confirmation before submission
- **AUTOFILL-02**: Site-specific adapters for Greenhouse, Lever, Workday

### Analytics

- **ANALYTICS-01**: Application response rate tracking
- **ANALYTICS-02**: Resume-to-interview conversion metrics

### Cross-Browser

- **BROWSER-01**: Firefox extension support

### Advanced AI

- **AI-01**: AI interview coaching using saved Q&A pairs for consistency checking

## Out of Scope

| Feature | Reason |
|---------|--------|
| Automatic form submission | Ethical concerns, ToS violations on job sites, quality over quantity |
| LinkedIn/Indeed OAuth integrations | Complexity, ToS risk, scraping-only approach for V1 |
| Team/collaborative features | Individual tool, not a team product |
| Mobile app | Chrome extension is the right surface for job applications |
| Built-in AI model | Users bring their own key or use Ollama |
| Email follow-up automation | Spam risk, low value vs complexity |
| Telemetry/analytics/usage tracking | Contradicts privacy-first design — by design |
| Site-specific DOM adapters V1 | High maintenance, each site is unique |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| SETUP-01 | Phase 1 | Complete |
| SETUP-02 | Phase 1 | Complete |
| SETUP-03 | Phase 1 | Complete |
| SETUP-04 | Phase 1 | Complete |
| CONFIG-01 | Phase 2 | Pending |
| CONFIG-02 | Phase 2 | Pending |
| CONFIG-03 | Phase 2 | Pending |
| CONFIG-04 | Phase 2 | Complete |
| CONFIG-05 | Phase 2 | Pending |
| API-03 | Phase 2 | Pending |
| API-04 | Phase 2 | Pending |
| API-05 | Phase 2 | Pending |
| API-08 | Phase 2 | Complete |
| RESUME-01 | Phase 3 | Pending |
| RESUME-02 | Phase 3 | Pending |
| RESUME-03 | Phase 3 | Pending |
| RESUME-04 | Phase 3 | Pending |
| RESUME-05 | Phase 3 | Pending |
| RESUME-06 | Phase 3 | Pending |
| RESUME-07 | Phase 3 | Pending |
| FORM-01 | Phase 3 | Pending |
| FORM-02 | Phase 3 | Pending |
| FORM-03 | Phase 3 | Pending |
| API-01 | Phase 3 | Pending |
| API-02 | Phase 3 | Pending |
| API-06 | Phase 3 | Pending |
| API-07 | Phase 3 | Pending |
| API-09 | Phase 3 | Pending |
| API-10 | Phase 3 | Pending |
| DETECT-01 | Phase 4 | Pending |
| DETECT-02 | Phase 4 | Pending |
| DETECT-03 | Phase 4 | Pending |
| DETECT-04 | Phase 4 | Pending |
| DETECT-05 | Phase 4 | Pending |
| FORM-04 | Phase 5 | Pending |
| FORM-05 | Phase 5 | Pending |
| TRACK-01 | Phase 5 | Pending |
| TRACK-02 | Phase 5 | Pending |
| TRACK-03 | Phase 5 | Pending |
| TRACK-04 | Phase 5 | Pending |
| TRACK-05 | Phase 5 | Pending |
| TRACK-06 | Phase 5 | Pending |
| DETAIL-01 | Phase 5 | Pending |
| DETAIL-02 | Phase 5 | Pending |
| DETAIL-03 | Phase 5 | Pending |
| DETAIL-04 | Phase 5 | Pending |
| DETAIL-05 | Phase 5 | Pending |
| CHAT-01 | Phase 5 | Pending |
| CHAT-02 | Phase 5 | Pending |
| CHAT-03 | Phase 5 | Pending |
| CHAT-04 | Phase 5 | Pending |
| CHAT-05 | Phase 5 | Pending |
| FORM-06 | Phase 6 | Pending |
| FORM-07 | Phase 6 | Pending |

**Coverage:**
- v1 requirements: 54 total
- Mapped to phases: 54
- Unmapped: 0

---
*Requirements defined: 2026-03-04*
*Last updated: 2026-03-04 — traceability populated by roadmapper*
