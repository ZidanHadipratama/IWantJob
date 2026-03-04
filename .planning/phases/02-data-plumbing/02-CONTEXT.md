# Phase 2: Data Plumbing - Context

**Gathered:** 2026-03-05
**Status:** Ready for planning

<domain>
## Phase Boundary

User can configure the extension (API key, Supabase credentials, backend URL, profile fields, base resume) via the Options page, and their data persists in Supabase through the backend API. Covers: DB service layer, non-AI endpoints (POST /log-job, GET /job/:id, POST /save-qa), and the full Options page. No AI features — just data plumbing.

</domain>

<decisions>
## Implementation Decisions

### Options Page Layout
- Single scrolling page with clear section headers (not tabs, not wizard)
- Each config group in a white card with border/shadow (like Chrome settings or Notion settings)
- Auto-save with 500ms debounce — subtle "Saved" indicator, no save button
- Setup progress indicator at top showing which sections are configured (e.g., "Setup 3/5 complete")

### Supabase Connection Flow
- Two input fields: Supabase project URL + anon key (matches what Supabase dashboard shows)
- "Test Connection" button that verifies credentials work (calls dedicated backend endpoint)
- Credentials stored in chrome.storage.local, sent to backend via per-request headers (X-Supabase-Url, X-Supabase-Key)
- Backend never persists Supabase credentials — stateless per-request pattern matching X-API-Key
- When credentials are missing and user tries a feature: show inline error + direct link to Options page (non-blocking for features that don't need DB)

### Resume Upload Experience
- Primary: PDF upload with backend pdfplumber parsing (PDF sent to backend, text returned, PDF not stored)
- Secondary: "Paste text instead" toggle for users without a PDF (Google Doc, plain text resume)
- After upload/parse: show extracted text in editable textarea so user can fix parsing errors before saving
- On parse failure: show "Could not parse PDF" error + offer text paste fallback

### Backend DB Client Pattern
- Supabase credentials flow via per-request headers from extension (X-Supabase-Url, X-Supabase-Key)
- Backend creates a fresh supabase-py v2 sync client per request (no singleton, no env vars required)
- FastAPI runs sync endpoints in threadpool automatically — no async supabase client needed
- user_id: Extension generates a UUID on first run, stored in chrome.storage.local, sent as X-User-Id header
- No Supabase Auth for V1 — simple UUID-based user isolation works for single-user self-hosted
- Dedicated GET /test-connection endpoint that takes Supabase headers and tries a lightweight query

### Claude's Discretion
- Exact card styling and spacing within Tailwind constraints
- Loading skeleton / spinner design during test connection and PDF parsing
- Specific input validation UX (inline errors, border colors)
- Order of sections on Options page
- Exact debounce implementation (lodash vs custom)

</decisions>

<specifics>
## Specific Ideas

- Options page should feel like a modern settings page (Chrome settings, Notion settings) — not a raw form
- The "Test Connection" button should give immediate green check / red X feedback
- Setup progress indicator helps first-time users know what's left to configure
- Resume textarea should be large enough to see meaningful content without scrolling excessively

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `extension/src/options.tsx`: Existing Options page shell (bare placeholder, needs full replacement)
- `backend/app/models/schemas.py`: Pydantic v2 schemas already exist for LogJobRequest, UserProfile, etc.
- `backend/app/services/db_service.py`: Empty DBService class placeholder ready for implementation
- `backend/app/routers/jobs.py`: Router stubs for /job/:id and /log-job (currently 501)
- `extension/src/style.css`: Tailwind CSS already configured

### Established Patterns
- Pydantic v2: model_config = ConfigDict(str_strip_whitespace=True), field_validator for validation
- Router registration: routers in backend/app/routers/, registered in main.py via app.include_router()
- CORS: allow_origin_regex for chrome-extension:// origins
- Plasmo flat entrypoints: options.tsx at src/ root, sub-components in src/components/

### Integration Points
- Options page writes config to chrome.storage.local (keys: ai_config, db_config, user_profile)
- Backend receives Supabase + API credentials via request headers
- Routers call DBService methods for all database operations
- PDF upload needs a new backend endpoint (POST /upload-resume or similar)

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 02-data-plumbing*
*Context gathered: 2026-03-05*
