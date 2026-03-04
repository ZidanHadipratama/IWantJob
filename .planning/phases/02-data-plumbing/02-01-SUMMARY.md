---
phase: 02-data-plumbing
plan: 01
subsystem: database
tags: [supabase, fastapi, python, crud, dependency-injection]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: FastAPI app skeleton, Pydantic schemas, stub routers

provides:
  - "DBService with 12 CRUD methods covering all 5 Supabase tables"
  - "FastAPI dependencies: get_supabase_client and get_user_id (header-based per-request Supabase client)"
  - "GET /test-connection endpoint with success/error informational response"
  - "New Pydantic schemas: QAPair, SaveQARequest, JobResponse, LogJobResponse, TestConnectionResponse"

affects:
  - 02-data-plumbing/02-02  # backend endpoints will inject DBService via Depends
  - 03-extension-shell       # Options page calls GET /test-connection
  - 04-content-layer         # form fill router uses DBService.upsert_qa_pairs

# Tech tracking
tech-stack:
  added:
    - supabase-py >= 2.4.0 (sync Client, installed in .venv)
  patterns:
    - "Per-request Supabase client: create_client called once per request from X-Supabase-Url/X-Supabase-Key headers via FastAPI Depends"
    - "DBService constructor injection: DBService(client, user_id) — all methods are user-scoped, no global state"
    - "Informational error pattern: /test-connection returns {connected: false, message: str} on DB error, never raises 500"

key-files:
  created:
    - backend/app/dependencies.py
    - backend/app/routers/connection.py
    - backend/tests/test_db_service.py
    - backend/tests/test_connection.py
  modified:
    - backend/app/services/db_service.py
    - backend/app/models/schemas.py
    - backend/app/main.py

key-decisions:
  - "Patch target for tests is app.dependencies.create_client (not app.routers.connection.create_client) since create_client is called inside get_supabase_client dependency"
  - "CORS allow_origin_regex updated to also allow http://localhost:\\d+ for Plasmo dev server compatibility"
  - "upsert_qa_pairs uses on_conflict='job_id,field_id' string (supabase-py v2 keyword arg) for correct upsert semantics"

patterns-established:
  - "Dependency injection pattern: all routers that touch DB import get_supabase_client + get_user_id, then pass client/user_id to DBService()"
  - "Missing header → 400 with 'Missing X-{Header-Name} header' message — never 500"

requirements-completed: [CONFIG-04, API-08]

# Metrics
duration: 7min
completed: 2026-03-04
---

# Phase 2 Plan 01: DB Service Layer Summary

**Supabase per-request client via FastAPI header injection (get_supabase_client/get_user_id) with DBService providing 12 user-scoped CRUD methods and GET /test-connection for credential validation**

## Performance

- **Duration:** ~7 min
- **Started:** 2026-03-04T21:45:53Z
- **Completed:** 2026-03-04T21:52:00Z
- **Tasks:** 2 (both TDD)
- **Files modified:** 7

## Accomplishments

- DBService class with 12 CRUD methods covering all 5 tables (users, jobs, form_qa_pairs, resumes, chat_messages) — all user_id-scoped
- FastAPI dependencies extracting X-Supabase-Url, X-Supabase-Key, and X-User-Id headers with proper 400 error handling
- GET /test-connection endpoint: returns connected=true on success or connected=false with descriptive message on failure (never 500)
- Full test coverage: 17 new tests, all 26 tests in suite pass

## Task Commits

Each task was committed atomically:

1. **Task 1: Create FastAPI dependencies and DBService with full CRUD** - `0c5ea56` (feat)
2. **Task 2: Create GET /test-connection endpoint and register in main.py** - `a78c76e` (feat)

## Files Created/Modified

- `backend/app/dependencies.py` - get_supabase_client and get_user_id FastAPI dependencies
- `backend/app/services/db_service.py` - DBService with 12 CRUD methods for all 5 tables
- `backend/app/routers/connection.py` - GET /test-connection router
- `backend/app/main.py` - Added connection router + localhost CORS origins
- `backend/app/models/schemas.py` - Added QAPair, SaveQARequest, JobResponse, LogJobResponse, TestConnectionResponse
- `backend/tests/test_db_service.py` - 14 unit tests with mocked Supabase client
- `backend/tests/test_connection.py` - 3 integration tests for /test-connection

## Decisions Made

- Patch target for connection tests is `app.dependencies.create_client` (not `app.routers.connection.create_client`) because `create_client` is invoked inside `get_supabase_client` dependency — test needed to mock at source
- CORS regex updated to `^(chrome-extension://.*|http://localhost:\\d+)$` to allow Plasmo dev server (localhost) alongside production Chrome extension origins
- `upsert_qa_pairs` passes `on_conflict="job_id,field_id"` as keyword argument per supabase-py v2 API

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Installed missing supabase-py package in .venv**
- **Found during:** Task 1 (GREEN phase — importing app.dependencies)
- **Issue:** supabase package was not installed in the local .venv; listed in requirements.txt but venv was missing it
- **Fix:** Ran `.venv/bin/pip install "supabase>=2.4.0"`
- **Files modified:** .venv (not tracked)
- **Verification:** Import succeeded, all tests passed
- **Committed in:** 0c5ea56 (Task 1 commit — code change, not pip install)

---

**Total deviations:** 1 auto-fixed (Rule 3 - blocking)
**Impact on plan:** Necessary for test execution; supabase 2.28.0 installed (within >=2.4.0 constraint). No scope creep.

## Issues Encountered

- Initial test for `test_test_connection_with_valid_headers_returns_connected_true` used wrong patch target (`app.routers.connection.create_client`). Fixed by patching `app.dependencies.create_client` where `create_client` is actually called. Tests passed after correction.

## User Setup Required

None - no external service configuration required at this layer. Supabase credentials are provided per-request via headers.

## Next Phase Readiness

- DBService and dependencies are importable by all Phase 2 Plan 02 routers
- DBService constructor pattern is established: `DBService(client=Depends(get_supabase_client), user_id=Depends(get_user_id))`
- GET /test-connection is live for Options page integration (Phase 3)
- No blockers

---
*Phase: 02-data-plumbing*
*Completed: 2026-03-04*
