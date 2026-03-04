# Codebase Structure

**Analysis Date:** 2026-03-04

## Directory Layout

```
JobPilot/
├── CLAUDE.md                          # Developer guidance (auto-read every session)
├── docs/
│   ├── PRD.md                         # Product requirements (features, UX flows)
│   └── SRS.md                         # Technical specification (API, DB schema, prompts)
├── extension/                         # Plasmo + React Chrome extension (NOT YET CREATED)
│   ├── src/
│   │   ├── contents/
│   │   │   └── content_script.ts      # Page content extraction + JD/form detection
│   │   ├── background/
│   │   │   └── background.ts          # Service worker (messaging hub)
│   │   ├── sidepanel/
│   │   │   ├── index.tsx              # 4-tab layout root (Fill Form, Resume, Tracker, Chat)
│   │   │   ├── FillForm.tsx           # Form fill answer generation tab
│   │   │   ├── Resume.tsx             # Resume tailoring + PDF download tab
│   │   │   ├── TrackerTable.tsx       # Tracker overview table (list of all jobs)
│   │   │   ├── JobDetail.tsx          # Tracker detail view (single job context)
│   │   │   ├── QAPanel.tsx            # Q&A display + inline edit (used in JobDetail)
│   │   │   └── Chat.tsx               # AI career coach chatbot tab
│   │   ├── popup/
│   │   │   └── index.tsx              # Quick status popup on extension icon click
│   │   └── options/
│   │       └── index.tsx              # Settings page (resume upload, API key, DB config)
│   ├── package.json                   # Plasmo project config
│   ├── tsconfig.json                  # TypeScript configuration
│   └── build/                         # Generated (git-ignored)
│
├── backend/                           # FastAPI Python backend (NOT YET CREATED)
│   ├── app/
│   │   ├── main.py                    # FastAPI app initialization + router registration
│   │   ├── routers/
│   │   │   ├── resume.py              # POST /tailor-resume endpoint
│   │   │   ├── form.py                # POST /fill-form, POST /save-qa endpoints
│   │   │   ├── jobs.py                # GET /job/:id, POST /log-job endpoints
│   │   │   └── chat.py                # POST /chat endpoint
│   │   ├── services/
│   │   │   ├── ai_service.py          # LiteLLM wrapper for all AI calls
│   │   │   ├── pdf_service.py         # WeasyPrint PDF generation
│   │   │   └── db_service.py          # Supabase client wrapper
│   │   ├── models/
│   │   │   └── schemas.py             # Pydantic request/response models
│   │   └── prompts/
│   │       ├── tailor_resume.txt      # Resume tailoring prompt template
│   │       ├── fill_form.txt          # Form fill prompt template
│   │       └── chat_coach.txt         # Career coach chatbot prompt template
│   ├── requirements.txt               # Python dependencies (fastapi, litellm, etc.)
│   ├── Dockerfile                     # Container image definition
│   └── __pycache__/                   # Generated (git-ignored)
│
├── supabase/                          # Database migration files
│   └── migrations/
│       ├── 001_initial_schema.sql     # users, jobs, resumes, chat_messages tables
│       └── 002_form_qa_pairs.sql      # form_qa_pairs table (Q&A core feature)
│
├── docker-compose.yml                 # Local dev stack (backend + dependencies)
└── .planning/                         # GSD analysis outputs (git-ignored)
    └── codebase/
        ├── ARCHITECTURE.md            # This file: layers, data flows, abstractions
        └── STRUCTURE.md               # Directory layout + naming conventions
```

## Directory Purposes

**JobPilot/ (root):**
- Purpose: Project root; contains CLAUDE.md (developer context), docs (specs), and three major subdirectories
- Committed: Yes (except .planning, build, __pycache__)

**docs/:**
- Purpose: Product and technical specifications
- Contains: PRD.md (features, UX flows), SRS.md (API contracts, DB schema, prompts, architecture)
- Key files: `docs/PRD.md`, `docs/SRS.md`
- Committed: Yes

**extension/:**
- Purpose: Plasmo Chrome extension source code
- Contains: React/TypeScript components, content scripts, background service worker, popup, options page
- Key files: `extension/src/sidepanel/index.tsx` (root), `extension/src/contents/content_script.ts` (page detection)
- Committed: Yes (except build/ and node_modules/)

**extension/src/contents/:**
- Purpose: Content scripts injected into every webpage
- Contains: `content_script.ts` — detects JD/form, extracts text/fields, sends to background worker
- Auto-runs on all pages; isolated from main world

**extension/src/background/:**
- Purpose: Service worker (MV3 background script)
- Contains: `background.ts` — messaging hub between content scripts and side panel, orchestrates backend API calls
- Runs persistently in extension context

**extension/src/sidepanel/:**
- Purpose: Main UI for extension users (4-tab layout)
- Contains: React components for Fill Form, Resume, Tracker, Chat tabs + shared utilities
- Key components:
  - `index.tsx`: Root with 4-tab navigation
  - `TrackerTable.tsx`: Table view of all jobs (rows are clickable)
  - `JobDetail.tsx`: Detailed single-job view (opened from TrackerTable)
  - `QAPanel.tsx`: Q&A display with inline editing (used inside JobDetail)
  - `Chat.tsx`: AI chatbot with job context

**extension/src/popup/:**
- Purpose: Quick popup shown on extension icon click
- Contains: `index.tsx` — status badge, open side panel button, settings link

**extension/src/options/:**
- Purpose: Full-page settings/onboarding interface
- Contains: `index.tsx` — resume upload, API key setup, DB connection string, profile fields

**backend/:**
- Purpose: FastAPI server for AI orchestration, DB ops, PDF generation
- Contains: Routers (endpoints), services (business logic), models (Pydantic schemas), prompts (template files)

**backend/app/routers/:**
- Purpose: Endpoint implementations
- Contains:
  - `resume.py`: POST /tailor-resume
  - `form.py`: POST /fill-form, POST /save-qa
  - `jobs.py`: GET /job/:id, POST /log-job
  - `chat.py`: POST /chat

**backend/app/services/:**
- Purpose: Business logic abstraction
- Contains:
  - `ai_service.py`: LiteLLM wrapper (calls OpenAI/Anthropic/Ollama)
  - `pdf_service.py`: WeasyPrint wrapper (generates PDF from text)
  - `db_service.py`: Supabase client wrapper (CRUD operations)

**backend/app/models/:**
- Purpose: Request/response validation
- Contains: `schemas.py` with Pydantic models for all endpoints

**backend/app/prompts/:**
- Purpose: AI prompt templates (decoupled from Python code)
- Contains: Plain text files with prompt instructions + placeholders
  - `tailor_resume.txt`: System + user message for resume tailoring
  - `fill_form.txt`: System + user message for form fill (returns JSON)
  - `chat_coach.txt`: System message for career coach context

**supabase/migrations/:**
- Purpose: Database schema definitions (applied via Supabase CLI or Dashboard)
- Contains: SQL files ordered numerically (001_, 002_, etc.)

## Key File Locations

**Entry Points:**

- `extension/src/sidepanel/index.tsx`: Main UI root — 4-tab navigation, selectedJobId state management
- `extension/src/contents/content_script.ts`: Content script entry — JD/form detection, field extraction
- `extension/src/background/background.ts`: Background service worker — messaging relay, API orchestration
- `backend/app/main.py`: FastAPI app — router registration, middleware, CORS setup
- `extension/src/options/index.tsx`: Onboarding/settings page (full-screen tab)

**Configuration:**

- `docker-compose.yml`: Local dev environment (backend + PostgreSQL)
- `extension/tsconfig.json`: TypeScript configuration for extension
- `extension/package.json`: Plasmo config + npm dependencies
- `backend/requirements.txt`: Python dependencies (fastapi, litellm, supabase, etc.)

**Core Logic:**

- `backend/app/services/ai_service.py`: LiteLLM wrapper — single point for all AI calls
- `backend/app/services/db_service.py`: Supabase operations — user_id isolation, cascade deletes
- `extension/src/sidepanel/TrackerTable.tsx`: Tracker overview table
- `extension/src/sidepanel/JobDetail.tsx`: Single-job detail view (JD + resume + Q&A + chat)

**Testing:**

- Not yet present in V1 (placeholder for future test files)

## Naming Conventions

**Files:**

- React components: PascalCase, `.tsx` extension (e.g., `TrackerTable.tsx`, `JobDetail.tsx`, `QAPanel.tsx`)
- Content script: `content_script.ts` (lowercase with underscore)
- Python routers: lowercase with underscore (e.g., `resume.py`, `form.py`, `jobs.py`, `chat.py`)
- Python services: lowercase with underscore (e.g., `ai_service.py`, `pdf_service.py`, `db_service.py`)
- Prompt templates: lowercase with underscore, `.txt` extension (e.g., `tailor_resume.txt`)
- SQL migrations: Numbered prefix + description (e.g., `001_initial_schema.sql`, `002_form_qa_pairs.sql`)

**Directories:**

- camelCase for feature-based: `sidepanel`, `popup`, `options` (extension UI surfaces)
- lowercase for code layers: `routers`, `services`, `models`, `contents`, `prompts`, `migrations`
- Plural for collections: `routers`, `services`, `models` (multiple files per directory)

**TypeScript/React:**

- Component state: `selectedJobId`, `chatHistory` (camelCase)
- Props interfaces: `TrackerTableProps`, `JobDetailProps` (PascalCase + "Props" suffix)
- Functions: `fetchJob`, `saveQAPair`, `tailorResume` (camelCase)
- Constants: `DEFAULT_BACKEND_URL`, `PROMPT_TIMEOUT_MS` (UPPER_SNAKE_CASE)

**Python:**

- Classes: `AIService`, `PDFService`, `DBService` (PascalCase)
- Functions: `fetch_job`, `save_qa_pair`, `tailor_resume` (snake_case)
- Constants: `DEFAULT_BACKEND_URL`, `PROMPT_TIMEOUT_MS` (UPPER_SNAKE_CASE)
- Request models: `TailorResumeRequest`, `FillFormRequest` (PascalCase)
- Response models: `TailorResumeResponse`, `JobDetailResponse` (PascalCase)

**Database:**

- Tables: lowercase plural (e.g., `users`, `jobs`, `form_qa_pairs`, `resumes`, `chat_messages`)
- Columns: lowercase with underscore (e.g., `user_id`, `job_id`, `field_id`, `edited_by_user`)
- Timestamps: `created_at`, `updated_at` (suffix convention)

## Where to Add New Code

**New Feature (e.g., resume version comparison):**
- Primary code: `extension/src/sidepanel/ResumeComparison.tsx` (new component)
- Backend: `backend/app/routers/resume.py` (add endpoint if needed)
- Tests: `extension/src/sidepanel/__tests__/ResumeComparison.test.tsx` (future)
- Database: Update `supabase/migrations/003_resume_versions.sql` if schema change needed

**New Component (e.g., date range filter for Tracker):**
- Implementation: `extension/src/sidepanel/DateRangeFilter.tsx` (new file)
- Import in: `extension/src/sidepanel/TrackerTable.tsx` (parent component)
- State management: Lift state to parent if shared with siblings; use React Context if complex

**Utilities (shared functions):**
- Shared helpers: Create `extension/src/utils/` directory
- Example: `extension/src/utils/formatDate.ts`, `extension/src/utils/apiClient.ts`
- Backend utils: Create `backend/app/utils.py` or subdirectory if many

**New Backend Endpoint (e.g., GET /jobs for list view):**
- Router: `backend/app/routers/jobs.py` (add endpoint here)
- Models: Add request/response schemas to `backend/app/models/schemas.py`
- Service: Add method to `backend/app/services/db_service.py` if DB operation needed
- Register in: `backend/app/main.py` (`app.include_router(router)`)

**New Prompt Template (e.g., interview coaching):**
- Create: `backend/app/prompts/interview_coach.txt`
- Load in: `backend/app/services/ai_service.py` (in prompt loading function)
- Call via: New router endpoint that uses the template

**New Database Table (e.g., saved searches):**
- Migration: `supabase/migrations/003_saved_searches.sql`
- Add methods to: `backend/app/services/db_service.py` for CRUD
- Create schema in: `backend/app/models/schemas.py` if returning to extension

**Tests (when implementing):**
- React component tests: Colocated in `__tests__/` directories (e.g., `extension/src/sidepanel/__tests__/TrackerTable.test.tsx`)
- Backend endpoint tests: `backend/tests/test_routers.py`
- Service tests: `backend/tests/test_services.py`

## Special Directories

**extension/build/:**
- Purpose: Compiled extension output (MV3 bundle)
- Generated: Yes (by `npm run build`)
- Committed: No (add to .gitignore)
- Contains: Minified JS, CSS, manifest.json, etc.

**backend/__pycache__/:**
- Purpose: Python bytecode cache
- Generated: Yes (by Python runtime)
- Committed: No (add to .gitignore)

**node_modules/ (extension):**
- Purpose: npm dependencies
- Generated: Yes (by `npm install`)
- Committed: No (add to .gitignore)

**supabase/migrations/:**
- Purpose: Version-controlled schema definitions
- Generated: No (manually created)
- Committed: Yes (critical for reproducibility)

**.planning/codebase/:**
- Purpose: GSD analysis outputs (this directory)
- Generated: Yes (by GSD analysis tool)
- Committed: No (add to .gitignore, regenerate as needed)

---

*Structure analysis: 2026-03-04*
