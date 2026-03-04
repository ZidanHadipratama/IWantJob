# Phase 1: Foundation - Context

**Gathered:** 2026-03-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Scaffolding for all three tiers: Chrome extension (Plasmo + React + TypeScript + Tailwind), FastAPI backend (Python 3.11+, Docker), and Supabase database (5 tables with RLS). Empty shells with architecture boundaries enforced from day one. No features — just working containers, a loadable extension, and a migrated database.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion

User granted full discretion on all Phase 1 implementation details. This is pure infrastructure scaffolding. Claude should follow these guidelines from the project docs:

**Docker setup:**
- Use `python:3.11-slim` base image with explicit apt-get for WeasyPrint system deps (libcairo2, libpango-1.0-0, libgdk-pixbuf2.0-0)
- Docker Compose with backend service only (Supabase is external, user-hosted)
- Dev-friendly: mount code volume for hot reload, expose port 8000

**Extension shell:**
- Follow SRS Section 2.1 file structure exactly
- 4-tab side panel with placeholder content per tab
- Popup with minimal status + link to open side panel
- Options page shell (full implementation in Phase 2)

**Backend scaffolding:**
- FastAPI app with health check endpoint
- Pydantic v2 schemas (use model_validator, model_config — not v1 patterns)
- CORS configured for chrome-extension:// origins
- Router stubs for all 7 endpoints (implementation in later phases)

**Database:**
- SQL migration files in supabase/migrations/
- All 5 tables: users, jobs, form_qa_pairs, resumes, chat_messages
- RLS enabled on every table with user_id policies
- Foreign keys and cascade deletes per SRS schema

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches. Follow SRS Section 9 file structure and SRS Section 4 DB schema exactly.

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `docs/PRD.md` and `docs/SRS.md` — complete specifications to follow
- `CLAUDE.md` — development commands and conventions

### Established Patterns
- No existing code patterns (greenfield)
- SRS defines the target file structure

### Integration Points
- Backend health check at http://localhost:8000
- Extension loads from extension/build/chrome-mv3-dev
- Supabase connection via user-provided URL + anon key

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 01-foundation*
*Context gathered: 2026-03-04*
