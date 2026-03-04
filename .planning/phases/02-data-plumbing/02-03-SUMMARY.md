---
phase: 02-data-plumbing
plan: "03"
subsystem: ui
tags: [plasmo, react, typescript, tailwind, chrome-extension, options-page, chrome-storage]

# Dependency graph
requires:
  - phase: 02-data-plumbing/02-01
    provides: GET /test-connection and POST /upload-resume backend endpoints called by Options page
  - phase: 02-data-plumbing/02-02
    provides: POST /save-resume-text and resume endpoints the Options page communicates with
provides:
  - Chrome extension Options page with 5 config card sections (AI, Backend, Supabase, Resume, Profile)
  - chrome.storage.local typed helpers (getStorage, setStorage, getOrCreateUserId)
  - API client with automatic header injection (X-Supabase-Url, X-Supabase-Key, X-User-Id, X-API-Key)
  - Setup progress indicator showing section completion state
  - Auto-save with 500ms debounce on all settings fields
  - Test Connection button with real-time green/red feedback
  - Resume PDF upload with parsed-text fallback to paste mode
affects: [03-ai-layer, 04-content-layer, sidepanel]

# Tech tracking
tech-stack:
  added: [lucide-react (icons for visual indicators)]
  patterns: [useDebounce hook (useRef + setTimeout, no lodash), chrome.storage.local typed wrapper pattern, API client factory (createApiClient async function)]

key-files:
  created:
    - extension/src/lib/storage.ts
    - extension/src/lib/api.ts
    - extension/src/components/options/SetupProgress.tsx
    - extension/src/components/options/AIConfigCard.tsx
    - extension/src/components/options/BackendConfigCard.tsx
    - extension/src/components/options/SupabaseConfigCard.tsx
    - extension/src/components/options/ResumeUploadCard.tsx
    - extension/src/components/options/ProfileCard.tsx
  modified:
    - extension/src/options.tsx

key-decisions:
  - "useDebounce implemented with useRef + setTimeout — no lodash dependency, keeps bundle lean"
  - "createApiClient() reads backend_url, db_config, user_id from storage at call time — always fresh config without prop drilling"
  - "getOrCreateUserId() generates UUID via crypto.randomUUID() on first run, then persists — stable user identity across sessions"
  - "Supabase Test Connection calls GET /test-connection with injected headers — validates real connectivity before user proceeds"
  - "ResumeUploadCard auto-switches to paste mode on PDF parse failure — graceful degradation"

patterns-established:
  - "Typed storage pattern: StorageSchema interface + generic getStorage<K>/setStorage<K> functions — type-safe chrome.storage.local access across entire extension"
  - "Debounce pattern: useDebounce(callback, delay) custom hook using useRef to hold timer — avoids stale closure issues"
  - "API client factory: createApiClient() reads all config from storage, returns methods with headers pre-injected — no prop drilling required"
  - "Card layout: bg-white rounded-lg shadow-sm border border-gray-200 p-6 — consistent across all settings sections"

requirements-completed: [CONFIG-01, CONFIG-02, CONFIG-03, CONFIG-04, CONFIG-05]

# Metrics
duration: 35min
completed: 2026-03-05
---

# Phase 2 Plan 03: Options Page Summary

**Full Chrome extension Options page with 5 typed config cards, chrome.storage.local helpers, debounced auto-save, live Supabase Test Connection, and PDF resume upload with paste fallback**

## Performance

- **Duration:** ~35 min
- **Started:** 2026-03-05
- **Completed:** 2026-03-05
- **Tasks:** 2 (1 auto + 1 human-verify checkpoint)
- **Files modified:** 9

## Accomplishments
- Complete Options page with AI, Backend, Supabase, Resume, and Profile config cards
- Typed chrome.storage.local helper layer with StorageSchema interface and generic get/set functions
- API client factory that injects all required headers (X-Supabase-Url, X-Supabase-Key, X-User-Id, X-API-Key) from stored config
- Setup progress indicator updates dynamically as sections are filled
- Auto-save with 500ms debounce — no save button needed, settings persist across browser restarts
- Test Connection button provides live green/red feedback via GET /test-connection backend call
- Resume PDF upload with backend parsing; on failure auto-falls back to paste textarea
- Human verification in Chrome browser passed — user confirmed "Looks good"

## Task Commits

Each task was committed atomically:

1. **Task 1: Create storage helpers, API client, and Options page with all config cards** - `ce53b5f` (feat)
2. **Task 2: Verify Options page in Chrome browser** - checkpoint (human-verify, approved)

**Plan metadata:** (this commit)

## Files Created/Modified
- `extension/src/lib/storage.ts` - Typed chrome.storage.local helpers (StorageSchema, getStorage, setStorage, getOrCreateUserId)
- `extension/src/lib/api.ts` - API client factory (createApiClient) with header injection and error handling
- `extension/src/options.tsx` - Main Options page layout, SetupProgress integration, card ordering
- `extension/src/components/options/SetupProgress.tsx` - Horizontal progress bar showing X/Y sections configured
- `extension/src/components/options/AIConfigCard.tsx` - Provider dropdown, API key (password+toggle), model input with per-provider defaults
- `extension/src/components/options/BackendConfigCard.tsx` - Backend URL input with default http://localhost:8000
- `extension/src/components/options/SupabaseConfigCard.tsx` - Supabase URL + key inputs, Test Connection button with live feedback
- `extension/src/components/options/ResumeUploadCard.tsx` - PDF drag-and-drop upload, extracted text textarea, paste fallback
- `extension/src/components/options/ProfileCard.tsx` - Name, email, LinkedIn, GitHub, work authorization fields

## Decisions Made
- Custom useDebounce hook with useRef + setTimeout — keeps lodash out of the bundle
- createApiClient() reads storage at call time — avoids stale config from component mount
- getOrCreateUserId() using crypto.randomUUID() — native, no uuid library needed
- Supabase key input uses password type with show/hide toggle — matches API key field pattern

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required. Users configure their own keys through the Options page itself.

## Next Phase Readiness
- Extension storage layer established — all future extension features can use typed getStorage/setStorage helpers
- API client pattern established — future extension components import createApiClient() for backend calls
- User identity (user_id) generation in place — all backend requests will carry stable user identity
- Options page is the last piece of Phase 2 — extension and backend are now wired up for Phase 3 (AI layer)

---
*Phase: 02-data-plumbing*
*Completed: 2026-03-05*
