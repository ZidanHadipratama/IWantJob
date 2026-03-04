# Codebase Concerns

**Analysis Date:** 2026-03-04

## Pre-Development Status

This project is in **pre-development stage** — core application code does not yet exist. Directories exist for `backend/app/{models,prompts,routers,services}` and extension structure, but are empty. All concerns below are **architectural and design risks** identified from the specification in `CLAUDE.md`, `docs/PRD.md`, and `docs/SRS.md`.

---

## Tech Debt & Design Risks

### 1. LiteLLM as Single Point of Failure

**Issue:** All AI provider abstraction is delegated entirely to LiteLLM. No fallback strategy if LiteLLM becomes unmaintained or incompatible with a provider.

**Files:** `backend/app/services/ai_service.py` (not yet created)

**Impact:**
- If LiteLLM breaks, all AI features stop working
- Version pinning becomes critical but challenging with multiple provider compatibility
- Custom prompt engineering harder to maintain across provider changes

**Fix approach:**
- Create thin wrapper around LiteLLM in `backend/app/services/ai_service.py` that can be swapped
- Implement provider-specific error handling and retry logic at wrapper level
- Document fallback procedures for each provider
- Consider creating adapters for each major provider (OpenAI, Anthropic, Gemini) that wrap LiteLLM

---

### 2. Form Q&A Offline Buffering Untested

**Issue:** Per `CLAUDE.md` (line 90), failed Q&A saves buffer to `pending_qa_pairs` in `chrome.storage.local`, but retry mechanism on extension open not yet implemented.

**Files:** `extension/src/sidepanel/FillForm.tsx` (not yet created)

**Impact:**
- If extension crashes during form fill, buffered Q&A may be lost
- No clear error reporting to user if buffer exceeds storage limits
- No deduplication logic if same Q&A pair queued multiple times

**Fix approach:**
- Implement explicit retry queue with exponential backoff in background worker
- Add UI feedback showing "X pending answers queued for save"
- Implement storage quota checking before buffering
- Create periodic sync (on extension wake, on successful DB connection)
- Set 24-hour expiration on buffered entries

---

### 3. PDF URL Expiry Not Enforced

**Issue:** Per `CLAUDE.md` (line 100) and `docs/SRS.md` (line 321), PDF URLs expire after 24 hours, but no mechanism to prevent users from treating them as permanent.

**Files:** `backend/app/services/pdf_service.py`, `extension/src/sidepanel/Resume.tsx` (not yet created)

**Impact:**
- User downloads PDF link, shares it, link dies after 24 hours
- User may assume PDF is stored permanently but it's actually transient
- Resume detail view may show broken PDF link when viewing past applications

**Fix approach:**
- Store PDF file in Supabase Storage with explicit 24-hour retention, return temporary signed URL
- Display "Expires in XX hours" badge next to PDF URL in UI
- On Job Detail View load, check PDF expiry and regenerate if needed
- Consider also storing base64-encoded PDF preview or plain-text resume as fallback

---

### 4. Content Script Page Detection Fragile

**Issue:** Per `docs/SRS.md` (Section 2.3), JD/form detection relies on heuristics: "long text block with responsibilities/requirements" and "3+ labeled inputs". This is brittle across different job sites.

**Files:** `extension/src/contents/content_script.ts` (not yet created)

**Impact:**
- Many job sites (Greenhouse, Lever, custom ATS) have different DOM structures
- False negatives: legitimate JDs not detected, form fields missed
- False positives: unrelated text blocks trigger "tailor resume"
- User frustrated by "No job content detected"

**Fix approach:**
- Create site-specific detection modules in `extension/src/contents/site-adapters/` (Greenhouse, Lever, etc)
- Add manual fallback: allow user to paste JD/form fields as plain text
- Implement confidence scoring for page classification
- Add telemetry (privacy-respecting) to identify undetected sites for V2 adapters
- Document heuristics and edge cases in comments

---

### 5. AI API Rate Limiting Not Handled

**Issue:** No specification for rate limiting behavior when users hit provider quotas (e.g., OpenAI daily limits, Anthropic concurrency).

**Files:** `backend/app/routers/` (not yet created)

**Impact:**
- User runs out of API quota mid-application session
- Error states not clearly differentiated: "API key invalid" vs "rate limited" vs "quota exceeded"
- No guidance on upgrading/purchasing more quota

**Fix approach:**
- Catch provider-specific rate limit errors in `ai_service.py` wrapper
- Return structured error responses with `{"error": "rate_limited", "retry_after": 3600}`
- Show user-friendly error: "You've hit your OpenAI usage limit. Upgrade or wait until tomorrow."
- Implement optional quota-aware feature degradation (e.g., skip PDF generation if low quota)

---

### 6. No Input Sanitization Spec for AI Safety

**Issue:** Per `CLAUDE.md` (line 104), backend must "validate + sanitize all HTML input before passing to AI", but no spec for what "sanitize" means or how to prevent prompt injection.

**Files:** `backend/app/routers/form.py`, `backend/app/routers/resume.py` (not yet created)

**Impact:**
- Malicious job descriptions with prompt injection could hijack AI responses
- User resumes with special characters/formatting could break JSON parsing
- No bounds checking on input sizes (very long JDs could blow up token budget)

**Fix approach:**
- Sanitize HTML in `backend/app/services/ai_service.py`:
  - Strip HTML tags from JD text (use `html.parser` or `bleach`)
  - Truncate JD to max 8000 tokens (specified in SRS Section 3.2)
  - Escape special chars that could be used in prompt injection
- Validate resume text: max character limit, check for valid UTF-8
- Add input validation middleware at FastAPI level
- Create comprehensive prompt injection test suite in tests

---

## Security Considerations

### 1. API Key Handling at Risk During Development

**Risk:** API keys stored in `chrome.storage.local` and passed in `X-API-Key` header. This is secure for user-owned backend, but:
- If deployed to public URL, anyone with URL can call endpoints (header is not authentication)
- Backend doesn't validate user_id ownership (assumes trust from header source)
- No rate limiting per API key

**Files:** `extension/src/background/background.ts` (not yet created), `backend/app/main.py`

**Current mitigation:** Documented as user-owned backend only

**Recommendations:**
- Implement proper JWT or mTLS for deployed backends
- Add backend URL validation: warn if user configures public URL without auth
- Document: "Only use this backend URL on your own server, never on shared/public instances"
- Add optional basic auth middleware (username/password) as V2 feature for self-hosters

---

### 2. Database Connection String Exposure

**Risk:** Supabase connection details stored in `chrome.storage.local`. If extension is compromised, attacker has DB access.

**Files:** Extension local storage (not yet created)

**Current mitigation:** All DB operations go through backend, not direct from extension

**Recommendations:**
- Document: "Supabase connection string should have row-level security (RLS) enabled"
- Add warning in options page if RLS is not detected
- Consider storing only Supabase URL, never the full connection string with key
- Add option to use Supabase Anon Key (read-only) instead of Service Key

---

### 3. No CORS/CSRF Protection Spec

**Issue:** No mention of CORS configuration for backend or CSRF tokens in extension requests.

**Files:** `backend/app/main.py` (not yet created)

**Impact:**
- If extension is compromised, can make requests to any backend
- Backend needs to validate Origin/Referer headers from extension

**Fix approach:**
- Add CORS middleware to FastAPI that only allows requests from Chrome extension ID
- Implement extension-specific header validation (Chrome-Extension origin)
- Document CORS setup in deployment guide

---

## Missing Critical Features

### 1. Form Field Type Support Incomplete

**Issue:** Form schema in `docs/SRS.md` (Section 2.4) supports `text | textarea | select | checkbox | radio`, but many forms also have:
- File uploads
- Date pickers
- Phone number fields
- Email fields
- Multi-select dropdowns
- Rich text editors
- Nested form sections

**Files:** `extension/src/contents/content_script.ts`

**Blocks:** Forms with unsupported field types will be partially incomplete

**Fix approach:**
- Extend FormField interface to include all modern HTML input types
- Add type detection for custom elements (date picker libraries, rich text editors)
- For unsupported types, show "Please fill this manually" placeholder
- Create framework adapters (Gravity Forms, Formik, React Hook Form detection)

---

### 2. Resume Parsing from PDF Not Specified

**Issue:** Per `docs/SRS.md` (line 522), `pdfplumber` is for resume parsing, but no endpoint or flow for parsing uploaded PDFs into structured fields.

**Files:** `backend/app/services/` - missing pdf parsing service

**Impact:**
- Options page upload flow unclear - does it parse PDF or store as-is?
- "auto-map resume to form fields" feature (PRD line 70) requires structured resume parsing
- If resume is just text dump, resume→form mapping will be poor

**Fix approach:**
- Create `backend/app/services/resume_parser.py` that extracts:
  - Skills section
  - Experience bullets
  - Education
  - Certifications
  - Contact info
- Store structured resume in DB, not just text
- Use parsed data to improve form field matching confidence

---

## Test Coverage Gaps

### 1. Form Fill Accuracy Not Testable

**What's not tested:** Whether AI-generated form answers match the resume/profile data accurately. No test data fixtures or golden dataset.

**Files:** `extension/src/sidepanel/FillForm.tsx`, `backend/app/routers/form.py` (not yet created)

**Risk:** Form fill feature could work but generate irrelevant answers without test harness to catch it

**Immediate action:**
- Create fixture: sample resumes, job descriptions, expected form answers in `backend/tests/fixtures/`
- Build integration test that feeds resume+JD through form fill, validates answer relevance
- Add visual regression testing for form answer UI rendering

---

### 2. Database Cascade Deletes Untested

**What's not tested:** When a job is deleted, does `form_qa_pairs` cascade properly? Are chat messages orphaned?

**Files:** `supabase/migrations/` (empty), database schema tests not yet created

**Risk:** Orphaned data accumulates, deleting jobs doesn't clean up fully

**Immediate action:**
- Create migration test suite that validates CASCADE constraints
- Add data cleanup verification: delete job → verify all related records gone
- Document cascade behavior in schema comments

---

### 3. Offline Tracker View Untested

**What's not tested:** Tracker tab should be readable offline (per PRD line 210). But syncing model when coming back online not specified.

**Files:** `extension/src/sidepanel/TrackerTable.tsx` (not yet created)

**Risk:** Offline-edited job data (status, notes) could conflict with server state when reconnecting

**Immediate action:**
- Add conflict resolution logic: last-write-wins with timestamp
- Test offline→online scenarios: job edited offline, also edited on server
- Show warning badge if local data is stale

---

## Performance Bottlenecks

### 1. Large Job Description Processing

**Problem:** JD tokens can be up to 8000 per SRS spec. For Anthropic/OpenAI, this is ~$0.03 per call. Large batch processing (50+ jobs) could be expensive.

**Files:** `backend/app/services/ai_service.py`

**Cause:** No token counting or optimization before AI calls

**Improvement path:**
- Implement token counting before sending JD to AI (use `tiktoken` for OpenAI, estimate for others)
- Add warning if JD exceeds N tokens (e.g., 4000)
- Implement summarization as preprocessing for very long JDs
- Cache processed JDs to avoid re-tokenizing

---

### 2. Resume + JD + Context Prompt Could Be Large

**Problem:** Chat endpoint (SRS Section 3.7) includes resume, JD, and Q&A history. For context-rich conversations, this multiplies token usage.

**Files:** `backend/app/routers/chat.py` (not yet created)

**Cause:** No context window budget management

**Improvement path:**
- Implement sliding window: keep recent N chat messages, truncate older history
- Summarize Q&A pairs to key skills/experiences instead of full text
- Add configurable context limits per AI provider
- Show user "Chat context will use ~X tokens per message"

---

### 3. Form Field Extraction on Large Pages

**Problem:** Content script runs on every page. Scanning for 3+ inputs across DOM could be slow on large SPAs.

**Files:** `extension/src/contents/content_script.ts` (not yet created)

**Cause:** No optimization for form field detection

**Improvement path:**
- Implement debounced observer for DOM changes (only re-scan after 500ms idle)
- Limit form field scan to visible viewport + below-fold (not entire page)
- Add early exit if >100 fields found (likely not an application form)
- Profile content script execution time in tests

---

## Fragile Areas

### 1. Tracker State Management Could Lose Data

**Component:** `extension/src/sidepanel/index.tsx` - root component managing Tracker navigation state

**Files:** Not yet created

**Why fragile:**
- State is React local state only (`selectedJobId`)
- Navigating away from extension loses state
- No persistence of "which job was I viewing"

**Safe modification:**
- Store `selectedJobId` in `chrome.storage.session`
- Load on extension open to restore last-viewed job
- Add tests that simulate extension close/reopen

---

### 2. Chat History Could Desync from Server

**Component:** Chat tab display and message history

**Files:** `extension/src/sidepanel/Chat.tsx` (not yet created), `backend/app/routers/chat.py`

**Why fragile:**
- No optimistic updates or conflict resolution
- If user sends message while offline, then extension closes, message state unclear
- Chat shown locally might not match server history

**Safe modification:**
- Implement optimistic message rendering with pending state
- On reconnect, validate chat history matches server (fetch from `GET /job/:id`)
- Show warning if local chat differs from server

---

### 3. PDF URL Invalidation During User Session

**Component:** Resume tab and Job Detail View

**Files:** `extension/src/sidepanel/Resume.tsx`, `extension/src/sidepanel/JobDetail.tsx` (not yet created)

**Why fragile:**
- User downloads PDF URL → waits 25 hours → tries to open it
- No refresh/regenerate button visible
- Stored PDF URL in job detail is now dead

**Safe modification:**
- Add "Regenerate PDF" button next to PDF link
- Check PDF URL expiry on Job Detail View load, regenerate if expired
- Store PDF generation timestamp, show "Generated X hours ago"

---

## Scaling Limits

### 1. Resume Tailoring Per Job

**Current capacity:** AI call per job = ~1 API request per tailoring

**Limit:** User applies to 50 jobs → 50 AI calls at $0.02-0.10 each = $1-5 spend

**Scaling path:**
- Batch resume tailoring (tailor N resumes in one call) - but reduces quality per job
- Implement caching of tailored resume if JD is similar to previous ones
- Add resume "templates" feature (V2) to reduce AI calls for common patterns

---

### 2. Chat Context Window on Long Conversations

**Current capacity:** Chat endpoint includes full history + resume + JD + Q&A

**Limit:** After ~20 messages per job, context window fills for smaller models (3.5-Sonnet)

**Scaling path:**
- Implement message summarization: summarize old messages into "summary" message
- Add configurable chat history truncation (keep last N messages)
- Offer "clear old history" option per job

---

### 3. Database Queries Per Job Detail View

**Current capacity:** `GET /job/:id` fetches job + JD + resume + Q&As + chat history in single view

**Limit:** Users with 500+ applications and 50+ Q&As per job = N+1 query risk if not optimized

**Scaling path:**
- Use database joins/views to fetch all data in single query
- Implement lazy loading for chat history (fetch first 10 messages, paginate)
- Cache Job Detail View data (30-second TTL) to reduce DB hits during user review

---

## Dependencies at Risk

### 1. Plasmo Framework Maintenance

**Risk:** Plasmo is actively maintained but smaller ecosystem than vanilla extensions. Breaking changes in Chrome MV3 not guaranteed to be patched immediately.

**Impact:** Extension might break on Chrome updates

**Migration plan:**
- Document how to convert to vanilla MV3 if Plasmo becomes unmaintained
- Keep extension code as vanilla as possible (avoid Plasmo-specific APIs)
- Monitor Plasmo release notes for each Chrome version update

---

### 2. LiteLLM Provider Deprecation

**Risk:** Provider drops support (e.g., Ollama API changes, OpenAI deprecates model)

**Impact:** Users on that provider can't use AI features

**Migration plan:**
- Implement version pinning for model names (e.g., `gpt-4-2024-04-19`)
- Add provider migration guide in docs
- Test against multiple models per provider in CI

---

### 3. Supabase Auth Changes

**Risk:** Supabase changes RLS policies or auth flow

**Impact:** Database access could fail

**Migration plan:**
- Document current RLS setup in code comments
- Add migrations to test suite (validate RLS after each schema change)
- Consider database-agnostic ORM layer (SQLAlchemy) to reduce Supabase-specific code

---

## Known Design Limitations (Not Bugs, But Constraints)

### 1. No Multi-Account Support (V1)

**Limitation:** Each extension instance tied to one user, one backend, one DB

**Workaround:** Users needing multiple accounts must use multiple browser profiles

---

### 2. Form Answers Copy-Paste Only (V1)

**Limitation:** User must manually copy-paste answers (no autofill)

**Mitigation:** Answers are saved to DB for future reference, so V2 autofill is easier

---

### 3. No Analytics or Insights (V1)

**Limitation:** User can't see application response rate, interview rate, etc.

**Planned for V3:** Add analytics dashboard showing application funnel

---

## Recommended Priority Order for Fixes

**High Priority (before V1 release):**
1. Form Q&A offline buffering + retry (data loss risk)
2. Input sanitization for AI safety (security + quality)
3. Content script page detection improvement (UX blocker)
4. PDF URL expiry handling (user confusion)

**Medium Priority (V1.1):**
5. LiteLLM fallback strategy
6. API rate limiting error handling
7. Resume parsing from PDF
8. Tracker state persistence across extension reopen

**Low Priority (V2+):**
9. Large form field handling (form adapters)
10. Chat context window optimization
11. Database query optimization for scale

---

*Concerns audit: 2026-03-04*
