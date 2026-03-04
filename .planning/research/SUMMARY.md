# Project Research Summary

**Project:** JobPilot
**Domain:** Chrome extension — AI-assisted job application tool with BYOK + self-hosted backend
**Researched:** 2026-03-04
**Confidence:** HIGH

## Executive Summary

JobPilot is a three-tier Chrome extension product (extension + FastAPI backend + user-owned Supabase DB) with a clearly defined, well-documented architecture. The stack is pre-decided in CLAUDE.md and SRS.md; research confirms all choices are sound and identifies the precise version constraints and compatibility concerns that will cause failures if ignored. The single most important build decision is enforcing strict component boundary rules from day one: the extension never touches the database directly, the backend never persists user credentials, and all AI calls route through LiteLLM. Violating any of these three rules requires disruptive refactoring later.

The competitive positioning is strong. No existing tool (Simplify, Teal, Huntr, Careerflow) stores the actual form Q&A pairs users submit on job sites. This is JobPilot's primary differentiator and must be treated as a first-class feature, not an afterthought. The copy-paste-only form fill approach in V1 is correct — autofill (DOM injection) is deliberately deferred because it is brittle across Greenhouse/Lever/Workday/LinkedIn and would consume the majority of V1 development time for disproportionate benefit.

The top risks are concrete and preventable. MV3 service worker termination after 30 seconds of inactivity will silently break offline Q&A retry if the service worker holds any in-memory state. SPA-based job sites (most major platforms) require MutationObserver-based form/JD detection, not naive page-load detection. WeasyPrint's CSS subset (no Grid, no Flexbox) must be discovered before designing resume templates, not after. Supabase RLS is disabled by default — every table migration must enable it. These are the four issues most likely to cause late-stage rework if not handled upfront.

---

## Key Findings

### Recommended Stack

The stack is fully validated. All technology choices are appropriate for the problem domain with no substitutions recommended. The critical implementation concerns are version-specific: LiteLLM must be pinned to an exact version (`litellm==1.40.0`) because it ships weekly with breaking changes; Pydantic v2 patterns differ significantly from v1 and many online tutorials show v1; supabase-py v2 uses an async client that matches FastAPI's async handlers (v1 patterns will not work); WeasyPrint requires Cairo and Pango system libraries installed in the Docker image at build time.

**Core technologies:**
- **Plasmo ~0.90.x**: Extension framework — MV3-first, handles service worker + side panel + content script injection via filesystem conventions; superior to CRXJS for active MV3 support
- **React 18.3.x + TypeScript 5.4.x + Tailwind 3.4.x**: Extension UI — standard modern web stack, no routing needed (selectedJobId state replaces react-router)
- **FastAPI 0.111.x + Pydantic v2**: Backend API — async-native, excellent OpenAPI docs, Pydantic v2 required for FastAPI 0.100+
- **LiteLLM 1.40.x**: AI abstraction — single interface for OpenAI/Anthropic/Gemini/Ollama; BYOK model depends entirely on this layer
- **WeasyPrint 62.x**: PDF generation — HTML/CSS-to-PDF; limited CSS support (no Grid/Flexbox) but sufficient for clean resume templates
- **pdfplumber 0.11.x**: Resume parsing — extracts text from uploaded PDF; fails silently on scanned/image-only PDFs
- **Supabase (hosted) + supabase-py v2**: User-owned PostgreSQL; async client matches FastAPI

### Expected Features

Research confirms the V1 feature set is well-scoped. The dependency tree shows that user profile (Options page) and base resume upload must be built before any AI feature can function. The backend API is a dependency for all AI features and all DB features — it is the critical path.

**Must have (table stakes):**
- Base resume upload (PDF → plain text via pdfplumber) — prerequisite for all AI features
- AI resume tailoring to JD — core value proposition, requires LiteLLM + prompt template
- PDF download of tailored resume — WeasyPrint, CSS-only layout
- Form field detection on page — content script DOM traversal with MutationObserver for SPAs
- AI-generated copy-paste answers per field — JSON-only LLM response, validated by Pydantic
- Q&A auto-save to database — upsert by (job_id, field_id), with offline buffer fallback
- Job tracker table (sortable, filterable) — all applications at a glance
- Job status management — saved → applied → interview → offer/rejected
- Options page: API key, Supabase credentials, user profile, base resume

**Should have (competitive differentiators):**
- Job Detail View — aggregated single view: JD + tailored resume + Q&A history + chat per application; no competitor offers this
- Full Q&A history per job with inline editing — the primary differentiator; users can review and correct what they submitted
- AI career coach chat with full job context (JD + resume + Q&A pairs) — grounded coaching, not generic advice
- Auto-log job on first interaction — zero-friction tracking

**Defer (v2+):**
- One-click autofill (DOM injection) — brittle, high maintenance, site-specific
- Site-specific adapters (Greenhouse, Lever, Workday) — each requires independent reverse engineering
- Firefox extension support — Plasmo supports it but testing effort doubles
- Application analytics

**Anti-features (never build):**
- Auto-submit applications — ToS violations, ethical concerns
- Built-in AI model — users have keys or can use Ollama free
- Analytics/telemetry — contradicts privacy-first open-source positioning

### Architecture Approach

The architecture is three-tier with strict unidirectional data flow and stateless backend per request. Each API call carries all required context: job_id, resume text, form fields, chat history, and the user's AI API key in the `X-API-Key` header. The backend discards the key after forwarding to LiteLLM. Chrome storage is the system of record for session state: `chrome.storage.local` for persistent config and the offline Q&A buffer, `chrome.storage.session` for active page context (current JD + form fields). The service worker is kept strictly stateless — it reconstructs context from storage on every wake because MV3 terminates it after 30 seconds of inactivity.

**Major components:**
1. **Content Script** — DOM reading only; detects JD text and form fields via MutationObserver; sends structured data to background worker; never writes to DOM in V1
2. **Background Service Worker** — stateless message router; relays API requests to backend; manages offline Q&A buffer retries via chrome.alarms
3. **Side Panel (React, 4-tab layout)** — all user-visible UI; communicates with backend through background worker only; manages `selectedJobId` state (null = TrackerTable, uuid = JobDetail)
4. **Options Page** — captures user profile, API key, Supabase credentials, base resume; writes to chrome.storage.local only; never calls backend
5. **FastAPI Backend (Routers + Services)** — stateless per-request; three internal services: AI service (LiteLLM wrapper + prompt loader), PDF service (WeasyPrint), DB service (Supabase CRUD with user_id isolation)
6. **Supabase DB** — user-owned PostgreSQL; five tables: users, jobs, form_qa_pairs, resumes, chat_messages; RLS required on all tables

### Critical Pitfalls

1. **MV3 service worker termination** — Store ALL state in chrome.storage, never in service worker memory variables. Use chrome.alarms for retry tasks. Design for statelessness from day one; retrofitting is painful. (Phase 1)
2. **SPA race condition in content scripts** — Job sites are SPAs; DOM content loads after page load event. Use MutationObserver + exponential backoff retry (500ms → 1s → 2s → 4s, max 10s). Without this, JD detection and form extraction silently return empty on most major job sites. (Phase 4)
3. **AI non-JSON output** — LLMs ignore "return only JSON" instructions. Use `response_format={"type": "json_object"}` in LiteLLM call + regex extraction fallback + Pydantic validation. Test with every supported provider — GPT-4o, Claude 3.5, Gemini, Ollama/Llama3 all behave differently. (Phase 3)
4. **Supabase RLS disabled by default** — Every table migration must include `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` and `USING (user_id = auth.uid())` policies. Missing this creates complete data exposure in any multi-user scenario. Backend db_service.py must also include user_id in all WHERE clauses as defense-in-depth. (Phase 1)
5. **WeasyPrint CSS subset** — No Grid, no Flexbox. Resume HTML templates must use CSS tables and floats. Do not design templates in browser and assume they match PDF output — test PDF after every template change. (Phase 3)

---

## Implications for Roadmap

Architecture research provides an explicit dependency-driven build order that should be adopted directly as the phase structure. Features cannot be built before their dependencies exist.

### Phase 1: Foundation
**Rationale:** Everything else depends on this. DB schema must exist before any DB service code. Backend scaffolding must exist before any API endpoint. Extension scaffolding must exist before any UI component. Architecture boundary rules (no direct DB from extension, no API key storage server-side, no direct AI SDK calls) must be enforced via structure from day one — they cannot be retrofitted cheaply.
**Delivers:** Working empty shells: Supabase DB with RLS-enabled schema + migrations, FastAPI app with Pydantic schemas and Docker Compose, Plasmo extension project with 4-tab side panel shell (no functionality)
**Addresses:** Settings/config table stakes (API key, backend URL, Supabase credentials stored in chrome.storage.local)
**Avoids:** Supabase RLS disaster (enable on all tables in migrations), Plasmo dev extension ID changes (wildcard CORS from start), LiteLLM version drift (pin exact version in requirements.txt), WeasyPrint Docker system deps (include Cairo/Pango in Dockerfile from day one), Tailwind dynamic class purging (configure safelist), FastAPI CORS for Chrome extensions

### Phase 2: Data Plumbing
**Rationale:** The DB service layer and Options page must be operational before AI features can be built. Resume tailoring needs the user's base resume text; form fill needs the user profile; tracker needs job CRUD. Build the data pipeline before the AI layer.
**Delivers:** Backend DB service with full CRUD (users, jobs, form_qa_pairs, resumes, chat_messages); POST /log-job, GET /job/:id, POST /save-qa endpoints; Options page (user profile, API key, Supabase config, base resume upload with pdfplumber)
**Uses:** supabase-py v2 async client, pdfplumber, FastAPI routers
**Avoids:** pdfplumber silent failures on scanned PDFs (validate extracted text length, offer manual paste fallback)

### Phase 3: AI Core
**Rationale:** With data plumbing in place, the AI service layer can be built against real endpoints. All three AI features (resume tailoring, form fill, chat) share the same LiteLLM wrapper and prompt template loader — build once, use three times. WeasyPrint PDF generation belongs here because it is tightly coupled to resume tailoring output.
**Delivers:** ai_service.py (LiteLLM wrapper, prompt template loader), POST /tailor-resume, POST /fill-form (with Q&A auto-save), POST /chat, POST /generate-pdf, all prompt template .txt files
**Uses:** LiteLLM 1.40.x (pinned), WeasyPrint 62.x, FastAPI, Pydantic v2
**Avoids:** Non-JSON AI output (response_format + regex fallback + Pydantic validation), WeasyPrint CSS limitations (tables/floats only), LiteLLM provider behavioral differences (test with GPT-4o + Claude 3.5 + Ollama/Llama3), prompt templates in Python files (load from .txt files at runtime)

### Phase 4: Extension Content Layer
**Rationale:** Content scripts and the background service worker are the bridge between the web page and the backend. They must be built with MutationObserver-based detection from the start (not retrofitted). The background worker's statelessness constraint is non-negotiable and hardest to retrofit.
**Delivers:** Content script (JD detection + text extraction + MutationObserver SPA handling), content script (form field detection + FormField[] extraction), background service worker (message routing, chrome.storage management, offline Q&A buffer with chrome.alarms retry)
**Avoids:** SPA race condition (MutationObserver + exponential backoff), MV3 service worker termination (stateless design, all state in chrome.storage), Chrome message passing reliability (use @plasmohq/messaging, add retry), form field ID instability (composite identifier: label + type + position)

### Phase 5: Extension UI
**Rationale:** With backend endpoints functional (Phases 1-3) and content layer operational (Phase 4), the React UI components can be built against real data. Building UI before the backend exists leads to mocking complexity and integration surprises.
**Delivers:** Fill Form tab (copy-paste answer interface), Resume tab (tailoring + PDF download), Tracker tab (TrackerTable + JobDetail + QAPanel with inline editing), Chat tab — all four tabs fully functional end-to-end
**Addresses:** All table stakes features, all differentiator features (Job Detail View, Q&A history, Chat with context)
**Avoids:** PDF signed URL expiry (show "regenerate" button, not stored URL), selectedJobId navigation pattern (no react-router)

### Phase 6: Resilience and Polish
**Rationale:** Error states, edge cases, and graceful degradation are easier to implement once the happy path works end-to-end. This phase prevents silent failures from reaching users.
**Delivers:** Offline Q&A buffering with chrome.alarms retry, error states (backend offline, AI errors, missing JD fallback, empty form detection), storage quota monitoring and cap (100 entry buffer limit, 80% usage warning), PDF URL expiry handling, backend-unreachable graceful degradation
**Avoids:** chrome.storage 10MB quota overflow, offline buffer duplicate row creation, silent failures across all edge cases

### Phase Ordering Rationale

- **Schema before service:** DB schema and migrations (Phase 1) must precede DB service code (Phase 2). Writing service code against an undefined schema means rewriting it.
- **Data before AI:** The AI layer (Phase 3) requires real data structures from Phase 2 — user profile, resume text, job_id — to build meaningful prompts and validate responses.
- **Backend before extension:** Building backend endpoints (Phases 1-3) before extension UI (Phase 5) eliminates the need for mocking and ensures integration works against real APIs.
- **Architecture boundaries are Phase 1:** The boundary rules (no direct DB from extension, no API key server-side, LiteLLM abstraction) are enforced by how code is structured, not by discipline. They must be established in scaffolding, not retrofitted.
- **Resilience is last:** Offline buffering and error states (Phase 6) are logically dependent on knowing what can fail, which only becomes clear after the happy path is complete.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 4 (Content Layer):** DOM detection strategies vary significantly by job site. MutationObserver patterns for SPAs, form field extraction heuristics, and field ID stability strategies need implementation-level detail before coding begins. The moderate pitfalls around field ID instability and message passing reliability compound here.
- **Phase 3 (AI Core):** Prompt engineering for resume tailoring and form fill is non-trivial. The exact prompt structure, token budget management per provider, and JSON enforcement strategy need explicit design. LiteLLM provider behavioral differences mean prompts must be tested with multiple models before finalizing.

Phases with standard patterns (skip or minimize research):
- **Phase 1 (Foundation):** Plasmo, FastAPI, Supabase setup follows well-documented official patterns. Docker Compose for FastAPI + WeasyPrint system deps is the only non-trivial configuration item.
- **Phase 2 (Data Plumbing):** CRUD endpoints with Pydantic validation and supabase-py are straightforward. pdfplumber text extraction is one-shot.
- **Phase 5 (Extension UI):** React component patterns within Plasmo are standard. The 4-tab layout with selectedJobId state navigation is explicitly defined in CLAUDE.md.
- **Phase 6 (Resilience):** chrome.alarms, storage quota checks, and error boundary patterns are well-documented.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Stack pre-decided in CLAUDE.md/SRS.md; research validates all choices; version constraints identified with specificity |
| Features | HIGH | Spec sourced from PRD.md and SRS.md (project's own documents); competitive analysis MEDIUM but feature decisions are HIGH based on project spec |
| Architecture | HIGH | Architecture derived directly from SRS.md codebase analysis; component boundaries explicitly specified; data flows fully documented |
| Pitfalls | HIGH | All major pitfalls are well-documented in Chrome MV3, LiteLLM, Supabase, and WeasyPrint official documentation; no speculation required |

**Overall confidence:** HIGH

### Gaps to Address

- **Exact LiteLLM version compatibility:** LiteLLM 1.40.0 was pinned based on training knowledge through 2025. Run `pip index versions litellm` before scaffolding to confirm the latest stable version and check changelog for breaking changes introduced since.
- **Plasmo version and side panel API:** Plasmo's side panel support evolves; confirm the exact API for side panel registration with Plasmo ~0.90.x documentation before scaffolding. The filesystem convention (`sidepanel/index.tsx`) should be verified against the current release.
- **Job site DOM structure for content scripts:** MutationObserver implementation details for Greenhouse, Lever, Workday, and LinkedIn are best researched at Phase 4 planning time when implementation begins. The field ID instability issue (Workday GUIDs) needs a concrete composite-key strategy designed before coding.
- **Supabase free tier limits:** Confirm that the free tier supports the expected data volume (5 tables, typical job seeker: ~50-200 jobs, ~500-2000 Q&A pairs). Storage limits for PDF uploads need verification.
- **WeasyPrint version in Docker:** Confirm WeasyPrint 62.x is installable from PyPI without compilation in `python:3.11-slim`. The Cairo/Pango apt package names should be verified against current Debian slim package repositories.

---

## Sources

### Primary (HIGH confidence)
- `CLAUDE.md` — Stack decisions, architecture boundaries, API contract, V1 scope
- `docs/SRS.md` — DB schema, API specs, data flows, file structure conventions
- `docs/PRD.md` — Feature specifications and user flows
- `.planning/codebase/ARCHITECTURE.md` — Codebase analysis
- `.planning/codebase/STRUCTURE.md` — Directory conventions

### Secondary (MEDIUM confidence)
- Training knowledge through 2025 — Competitor analysis (Simplify, Teal, Huntr, LazyApply, Careerflow feature sets)
- Training knowledge through 2025 — Library versions (Plasmo 0.90.x, FastAPI 0.111.x, LiteLLM 1.40.x, WeasyPrint 62.x)

### Tertiary (LOW confidence)
- Inferred: Supabase free tier capacity assumptions — needs explicit verification before production planning

---

*Research completed: 2026-03-04*
*Ready for roadmap: yes*
