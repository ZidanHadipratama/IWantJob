---
phase: 02-data-plumbing
plan: 02
subsystem: api
tags: [fastapi, pdfplumber, supabase, crud, python-multipart, file-upload]

# Dependency graph
requires:
  - phase: 02-data-plumbing/02-01
    provides: DBService class, get_supabase_client/get_user_id dependencies, all schemas

provides:
  - POST /log-job: create or update job entry with HTML sanitization
  - GET /job/:id: full job record with Q&A pairs, resumes, chat messages
  - POST /save-qa: upsert Q&A pairs by (job_id, field_id) unique key
  - POST /upload-resume: PDF text extraction via pdfplumber, save as base resume
  - POST /save-resume-text: plain text resume paste fallback, save as base resume

affects: [03-ai-layer, extension-options-page, extension-tracker-tab]

# Tech tracking
tech-stack:
  added: [pdfplumber>=0.11.0, python-multipart>=0.0.9]
  patterns:
    - HTML stripping via re.sub on all user-supplied text fields before DB write
    - UploadFile + pdfplumber for PDF parsing with graceful error handling
    - Update-or-create pattern: job_id field in LogJobRequest routes to update vs create

key-files:
  created:
    - backend/tests/test_endpoints.py
    - backend/tests/test_upload_resume.py
  modified:
    - backend/app/routers/jobs.py
    - backend/app/routers/form.py
    - backend/app/routers/resume.py
    - backend/app/models/schemas.py
    - backend/requirements.txt
    - backend/tests/test_stubs.py

key-decisions:
  - "LogJobRequest includes optional job_id field — presence routes to update, absence to create (update-or-create pattern)"
  - "POST /upload-resume and POST /save-resume-text are separate endpoints — cleaner than a single endpoint with branching on content-type"
  - "HTML tags stripped from company, title, job_description, and resume text fields to satisfy API-08 input sanitization"
  - "python-multipart added to requirements.txt — required by FastAPI UploadFile handling"

patterns-established:
  - "HTML sanitization: _strip_html() helper using re.sub(r'<[^>]+>', '') applied to all user text before DB writes"
  - "PDF extraction: pdfplumber.open(io.BytesIO(bytes)) with joined page text and empty-text check"
  - "TDD pattern: failing tests committed first, then implementation — same pytest/httpx/mock stack as 02-01"

requirements-completed: [API-03, API-04, API-05, API-08]

# Metrics
duration: 15min
completed: 2026-03-05
---

# Phase 2 Plan 02: Non-AI CRUD Endpoints Summary

**POST /log-job (create/update), GET /job/:id (full detail), POST /save-qa (upsert), POST /upload-resume (pdfplumber extraction), and POST /save-resume-text — 14 new tests, all passing**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-03-05T00:00:00Z
- **Completed:** 2026-03-05T00:15:00Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments

- Implemented all non-AI backend endpoints needed by the Options page (Phase 3) and extension Tracker tab
- 14 integration tests via TDD (9 for jobs/form, 5 for resume) — 37 total tests passing across all test files
- HTML input sanitization on all user-supplied text fields (API-08 compliance)
- PDF text extraction via pdfplumber with graceful 400 errors for non-PDFs, corrupt files, and image-only PDFs

## Task Commits

Each task was committed atomically:

1. **Task 1: POST /log-job, GET /job/:id, POST /save-qa** - `fdeb48e` (feat)
2. **Task 2: POST /upload-resume, POST /save-resume-text** - `cfd5055` (feat)

## Files Created/Modified

- `backend/app/routers/jobs.py` - Rewrote: POST /log-job (create/update with HTML strip), GET /job/:id (full detail with sub-collections)
- `backend/app/routers/form.py` - Updated: POST /save-qa upserts Q&A pairs; POST /fill-form remains 501 stub
- `backend/app/routers/resume.py` - Rewrote: POST /upload-resume (pdfplumber), POST /save-resume-text (paste fallback); Phase 3 stubs kept
- `backend/app/models/schemas.py` - Added `job_id: Optional[UUID] = None` to LogJobRequest for update-or-create pattern
- `backend/requirements.txt` - Added python-multipart>=0.0.9 (required for UploadFile)
- `backend/tests/test_endpoints.py` - Created: 9 integration tests for jobs and save-qa endpoints
- `backend/tests/test_upload_resume.py` - Created: 5 integration tests for PDF upload and text save
- `backend/tests/test_stubs.py` - Updated: removed now-implemented endpoints (save-qa, log-job, get-job) from 501 stub list

## Decisions Made

- `LogJobRequest.job_id` optional field drives update-or-create: presence → `db.update_job()`, absence → `db.create_job()`
- Two separate resume endpoints (`/upload-resume` for file, `/save-resume-text` for JSON) are cleaner than branching on content-type in one endpoint
- HTML sanitization applied via `_strip_html()` helper duplicated in jobs.py and resume.py (not shared module) to avoid circular imports at this stage

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated test_stubs.py to remove implemented endpoints**
- **Found during:** Task 1 (after implementation, stubs test broke)
- **Issue:** test_stubs.py expected save-qa, log-job, and get-job to return 501 — they now return 400/422 (correct behavior)
- **Fix:** Removed the 3 implemented endpoints from STUB_ENDPOINTS list, kept Phase 3 stubs only
- **Files modified:** backend/tests/test_stubs.py
- **Verification:** All 4 remaining stub tests pass
- **Committed in:** fdeb48e (Task 1 commit)

**2. [Rule 3 - Blocking] Installed pdfplumber in venv**
- **Found during:** Task 2 (test collection failure)
- **Issue:** pdfplumber not installed in .venv despite being in requirements.txt
- **Fix:** Ran `.venv/bin/pip install pdfplumber`
- **Files modified:** None (venv install only)
- **Verification:** Import succeeds, tests pass
- **Committed in:** cfd5055 (Task 2 commit)

**3. [Rule 3 - Blocking] Added python-multipart to requirements.txt and installed in venv**
- **Found during:** Task 2 (FastAPI UploadFile RuntimeError during test collection)
- **Issue:** FastAPI UploadFile requires python-multipart — missing from both venv and requirements.txt
- **Fix:** `pip install python-multipart`, added `python-multipart>=0.0.9` to requirements.txt
- **Files modified:** backend/requirements.txt
- **Verification:** UploadFile endpoint works, 5 tests pass
- **Committed in:** cfd5055 (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (1 test fix, 2 missing dependencies)
**Impact on plan:** All auto-fixes necessary for correctness. No scope creep.

## Issues Encountered

None beyond the auto-fixed deviations above.

## Next Phase Readiness

- All non-AI endpoints are now implemented and tested
- Phase 3 (AI Layer) can use DBService via the same dependency injection pattern
- Options page (plan 03) can save resumes via POST /upload-resume and POST /save-resume-text
- Extension Tracker tab can call POST /log-job and GET /job/:id

---
*Phase: 02-data-plumbing*
*Completed: 2026-03-05*

## Self-Check: PASSED

- backend/app/routers/jobs.py: FOUND
- backend/app/routers/form.py: FOUND
- backend/app/routers/resume.py: FOUND
- backend/tests/test_endpoints.py: FOUND
- backend/tests/test_upload_resume.py: FOUND
- .planning/phases/02-data-plumbing/02-02-SUMMARY.md: FOUND
- Commit fdeb48e: FOUND
- Commit cfd5055: FOUND
