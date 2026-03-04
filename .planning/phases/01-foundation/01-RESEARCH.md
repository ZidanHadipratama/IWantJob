# Phase 1: Foundation - Research

**Researched:** 2026-03-04
**Domain:** FastAPI scaffolding, Plasmo Chrome Extension (MV3), Supabase SQL migrations with RLS, Docker Compose
**Confidence:** HIGH (stack is fully specified in SRS.md and CLAUDE.md; no ambiguity in choices)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

User granted full discretion on all Phase 1 implementation details. Specific structural decisions locked:

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

### Claude's Discretion

All implementation details within the above guidelines.

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SETUP-01 | Backend scaffolding with FastAPI, Pydantic v2 schemas, Docker Compose, CORS for chrome-extension origins | FastAPI app structure, Pydantic v2 patterns, Docker Compose volume mounts, CORS middleware config |
| SETUP-02 | Database schema with all 5 tables and RLS policies | SQL DDL from SRS Section 4, Supabase RLS policy syntax, migration file naming |
| SETUP-03 | Extension scaffolding with Plasmo, React, TypeScript, Tailwind, 4-tab side panel shell | Plasmo init, side panel entrypoint convention, Tailwind config, tab layout pattern |
| SETUP-04 | Docker Compose one-command setup (`docker compose up`) for backend + dependencies | Compose service definition, volume mount for dev hot reload, WeasyPrint apt deps |
</phase_requirements>

---

## Summary

Phase 1 is pure scaffolding across three tiers: a FastAPI backend in Docker, all 5 Supabase tables with RLS, and a Plasmo Chrome extension with a 4-tab side panel. The stack is completely specified — no technology decisions remain. All three plans (01-01 backend, 01-02 database, 01-03 extension) are independent and can run in parallel.

The most technically nuanced areas are: (1) Plasmo's side panel entrypoint convention (file must be named `sidepanel.tsx` at the root of `src/` OR declared in `package.json` — this must be verified); (2) WeasyPrint's apt-package names on `python:3.11-slim` — the package names vary by Debian release; (3) Pydantic v2 migration from v1 patterns (common pitfall for engineers with v1 muscle memory); (4) Supabase RLS being disabled by default — every table needs `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` explicitly.

**Primary recommendation:** Scaffold all three tiers as thin but complete shells. The goal is passing integration tests (health check, extension loads, DB tables exist) — not feature implementation.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| FastAPI | 0.111+ | HTTP framework | Project spec — async, auto-docs |
| Pydantic | v2 (2.x) | Request/response schemas | Project spec — v2 only, not v1 |
| uvicorn | 0.29+ | ASGI server | Standard FastAPI server |
| python-dotenv | 1.0+ | Env var loading | Dev config in .env file |
| Plasmo | latest (0.90+) | Extension framework | Project spec — MV3, hot reload |
| React | 18.x | UI framework | Plasmo's default |
| TypeScript | 5.x | Type safety | Project spec |
| Tailwind CSS | 3.x | Styling | Project spec |
| WeasyPrint | 62.x | PDF generation | Project spec — stubbed in Phase 1 |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| fastapi[standard] | 0.111+ | Includes uvicorn extras | Use instead of bare fastapi |
| httpx | 0.27+ | Async HTTP client (backend→Supabase) | DB calls from backend |
| supabase-py | 2.x | Supabase client for Python | DB service layer |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Plasmo | Vanilla CRX / CRXJS | Plasmo provides hot reload, TS support, React — locked per CLAUDE.md |
| Supabase | Firebase, PlanetScale | Supabase is user-owned PostgreSQL — locked per project spec |
| WeasyPrint | ReportLab, Puppeteer | WeasyPrint HTML→PDF is simpler — locked per CLAUDE.md |

### Installation

**Backend:**
```bash
# backend/requirements.txt
fastapi[standard]>=0.111.0
uvicorn[standard]>=0.29.0
pydantic>=2.7.0
python-dotenv>=1.0.0
httpx>=0.27.0
supabase>=2.4.0
weasyprint>=62.0
pdfplumber>=0.11.0
litellm>=1.40.0
```

**Extension:**
```bash
cd extension
npm create plasmo@latest .
npm install
# Tailwind is added via Plasmo's built-in support or manually:
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init
```

---

## Architecture Patterns

### Recommended Project Structure

Per SRS Section 9 (authoritative — do not deviate):

```
jobpilot/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI app, CORS, router includes
│   │   ├── routers/
│   │   │   ├── resume.py        # /tailor-resume, /generate-pdf
│   │   │   ├── form.py          # /fill-form, /save-qa
│   │   │   ├── jobs.py          # /job/:id, /log-job
│   │   │   └── chat.py          # /chat
│   │   ├── services/
│   │   │   ├── ai_service.py    # LiteLLM wrapper (stub in Phase 1)
│   │   │   ├── pdf_service.py   # WeasyPrint (stub in Phase 1)
│   │   │   └── db_service.py    # Supabase client
│   │   ├── prompts/             # .txt files loaded at runtime
│   │   │   ├── tailor_resume.txt
│   │   │   ├── fill_form.txt
│   │   │   └── chat_coach.txt
│   │   └── models/
│   │       └── schemas.py       # All Pydantic v2 models
│   ├── requirements.txt
│   └── Dockerfile
├── extension/
│   └── src/
│       ├── contents/
│       │   └── content_script.ts
│       ├── background/
│       │   └── background.ts
│       ├── sidepanel/
│       │   ├── index.tsx        # 4-tab root layout
│       │   ├── FillForm.tsx
│       │   ├── Resume.tsx
│       │   ├── TrackerTable.tsx
│       │   ├── JobDetail.tsx
│       │   ├── QAPanel.tsx
│       │   └── Chat.tsx
│       ├── popup/
│       │   └── index.tsx
│       └── options/
│           └── index.tsx
├── supabase/
│   └── migrations/
│       ├── 001_initial_schema.sql
│       └── 002_form_qa_pairs.sql
└── docker-compose.yml
```

### Pattern 1: FastAPI App with Router Stubs

**What:** Central `main.py` wires CORS middleware and includes all routers. Routers return `501 Not Implemented` until Phase 3.
**When to use:** Always — establishes module boundaries before implementation.

```python
# backend/app/main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import resume, form, jobs, chat

app = FastAPI(title="JobPilot API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["chrome-extension://*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(resume.router)
app.include_router(form.router)
app.include_router(jobs.router)
app.include_router(chat.router)

@app.get("/health")
async def health():
    return {"status": "ok", "service": "jobpilot-backend"}
```

### Pattern 2: Pydantic v2 Schemas

**What:** Use `model_config`, `model_validator`, and `field_validator` — NOT v1's `class Config`, `@validator`, `@root_validator`.
**When to use:** All Pydantic models in `schemas.py`.

```python
# backend/app/models/schemas.py
from pydantic import BaseModel, model_config, field_validator
from typing import Optional
from uuid import UUID

class UserProfile(BaseModel):
    model_config = model_config(str_strip_whitespace=True)
    name: str
    email: str
    work_authorization: Optional[str] = None
    linkedin_url: Optional[str] = None

class FillFormRequest(BaseModel):
    model_config = model_config(str_strip_whitespace=True)
    form_fields: list[dict]
    resume_text: str
    user_profile: UserProfile
    job_id: Optional[UUID] = None
    job_description: Optional[str] = None
```

### Pattern 3: Docker Compose with Dev Volume Mount

**What:** Mount source code as a volume so uvicorn `--reload` picks up changes without rebuilding the image.
**When to use:** Dev environment (the only Compose config in Phase 1).

```yaml
# docker-compose.yml
services:
  backend:
    build: ./backend
    ports:
      - "8000:8000"
    volumes:
      - ./backend:/app
    environment:
      - PYTHONUNBUFFERED=1
    command: uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

```dockerfile
# backend/Dockerfile
FROM python:3.11-slim

# WeasyPrint system dependencies (Cairo, Pango, GDK-Pixbuf)
RUN apt-get update && apt-get install -y \
    libcairo2 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libgdk-pixbuf2.0-0 \
    libffi-dev \
    shared-mime-info \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

### Pattern 4: Plasmo Side Panel Entrypoint

**What:** Plasmo uses a file-based routing convention. A side panel is declared by creating `src/sidepanel.tsx` at the root (NOT inside a `sidepanel/` folder). The `sidepanel/` folder holds component files imported by `src/sidepanel.tsx`.

**CRITICAL:** The Plasmo entrypoint file MUST be `src/sidepanel.tsx` (flat), not `src/sidepanel/index.tsx`. Plasmo will not recognize `index.tsx` inside a subdirectory as a side panel entrypoint automatically — the convention is the flat file.

```
extension/src/
├── sidepanel.tsx          # <-- Plasmo entrypoint (flat, not in subdir)
├── popup.tsx              # <-- Plasmo popup entrypoint
├── options.tsx            # <-- Plasmo options entrypoint
├── components/
│   └── sidepanel/         # Component files imported by sidepanel.tsx
│       ├── FillForm.tsx
│       ├── Resume.tsx
│       ├── TrackerTable.tsx
│       ├── JobDetail.tsx
│       ├── QAPanel.tsx
│       └── Chat.tsx
├── contents/
│   └── content_script.ts
└── background/
    └── background.ts
```

> NOTE: The SRS Section 2.1 shows `sidepanel/index.tsx` as the root. Plasmo's entrypoint convention requires `src/sidepanel.tsx` (flat). The sub-components (`FillForm.tsx`, etc.) should live under `src/components/sidepanel/` and be imported by `src/sidepanel.tsx`. The SRS structure shows logical grouping, not Plasmo's filesystem convention. The planner must reconcile this — see Open Questions #1.

### Pattern 5: Supabase RLS Policies

**What:** RLS is DISABLED by default on all Supabase tables. Must be explicitly enabled per table. Standard policy: users can only see/modify their own rows.

```sql
-- Enable RLS (CRITICAL — disabled by default)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE form_qa_pairs ENABLE ROW LEVEL SECURITY;
ALTER TABLE resumes ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

-- Standard user-scoped policies
CREATE POLICY "Users can manage own data" ON users
  FOR ALL USING (auth.uid() = id);

CREATE POLICY "Users can manage own jobs" ON jobs
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own qa_pairs" ON form_qa_pairs
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own resumes" ON resumes
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own chat_messages" ON chat_messages
  FOR ALL USING (auth.uid() = user_id);
```

### Pattern 6: Plasmo 4-Tab Side Panel Shell

```tsx
// src/sidepanel.tsx
import { useState } from "react"

type Tab = "fill-form" | "resume" | "tracker" | "chat"

export default function SidePanel() {
  const [activeTab, setActiveTab] = useState<Tab>("fill-form")

  const tabs: { id: Tab; label: string }[] = [
    { id: "fill-form", label: "Fill Form" },
    { id: "resume", label: "Resume" },
    { id: "tracker", label: "Tracker" },
    { id: "chat", label: "Chat" },
  ]

  return (
    <div className="flex flex-col h-screen bg-white">
      <nav className="flex border-b">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 py-2 text-sm font-medium ${
              activeTab === tab.id
                ? "border-b-2 border-blue-500 text-blue-600"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </nav>
      <main className="flex-1 overflow-auto p-4">
        {activeTab === "fill-form" && <div>Fill Form — coming soon</div>}
        {activeTab === "resume" && <div>Resume — coming soon</div>}
        {activeTab === "tracker" && <div>Tracker — coming soon</div>}
        {activeTab === "chat" && <div>Chat — coming soon</div>}
      </main>
    </div>
  )
}
```

### Anti-Patterns to Avoid

- **Pydantic v1 patterns in v2:** Never use `class Config`, `@validator`, or `@root_validator` — use `model_config`, `@field_validator`, `@model_validator` instead.
- **Skipping RLS enable:** Writing `CREATE POLICY` without first `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` — policies are silently ignored if RLS is off.
- **Hardcoded CORS origin strings:** `"chrome-extension://*"` requires wildcard, not an exact extension ID in dev (the ID changes between installs). For production, pin the exact extension ID.
- **CMD vs ENTRYPOINT for hot reload:** Use `command:` override in docker-compose.yml to pass `--reload` flag — don't bake it into Dockerfile CMD.
- **Nested sidepanel entrypoint:** Plasmo won't auto-register `src/sidepanel/index.tsx` — it must be `src/sidepanel.tsx` (flat).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| HTML→PDF conversion | Custom PDF renderer | WeasyPrint | WeasyPrint handles all CSS layout, fonts, page breaks — immense complexity |
| SQL migrations | Manual psql scripts | Supabase migration files (numbered SQL) | Versioned, reproducible, team-friendly |
| AI provider abstraction | Direct provider SDK calls | LiteLLM | Single interface for OpenAI/Anthropic/Gemini/Ollama — locked per CLAUDE.md |
| Extension hot reload | Custom webpack/esbuild config | Plasmo's built-in dev server | Plasmo handles MV3 service worker, content script, side panel hot reload |
| CORS validation | Custom header inspection | FastAPI CORSMiddleware | Edge cases in preflight handling, vary headers — middleware covers all of it |
| RLS query scoping | `WHERE user_id = ?` in every query | Supabase RLS policies | Policies are enforced at DB level — can't be bypassed by application bug |

**Key insight:** The three "hard problems" in this phase (PDF generation, AI abstraction, DB security) all have best-in-class solutions in the locked stack. Phase 1 stubs them all — just ensure the wiring exists.

---

## Common Pitfalls

### Pitfall 1: WeasyPrint System Dependencies on Slim Base

**What goes wrong:** `pip install weasyprint` succeeds, but `import weasyprint` at runtime raises `OSError: cannot load library 'libgobject-2.0-0'` or similar.
**Why it happens:** `python:3.11-slim` strips shared libraries. WeasyPrint requires Cairo, Pango, GDK-PixBuf — all must be installed via apt-get.
**How to avoid:** In Dockerfile, BEFORE installing Python packages, run:
```bash
RUN apt-get update && apt-get install -y \
    libcairo2 libpango-1.0-0 libpangocairo-1.0-0 \
    libgdk-pixbuf2.0-0 libffi-dev shared-mime-info \
    && rm -rf /var/lib/apt/lists/*
```
**Warning signs:** Container builds successfully but crashes on first PDF request.

### Pitfall 2: Pydantic v1 vs v2 API Mismatch

**What goes wrong:** Code uses `class Config`, `@validator`, or `.dict()` — works on install but emits deprecation warnings or fails silently on nested model validation.
**Why it happens:** Pydantic v2 ships with a v1 compatibility shim, but it's not 100% compatible and will be removed.
**How to avoid:** Use v2 API exclusively:
- `model_config = ConfigDict(...)` not `class Config`
- `@field_validator` not `@validator`
- `.model_dump()` not `.dict()`
- `.model_validate()` not `.from_orm()` or `.parse_obj()`
**Warning signs:** `PydanticDeprecatedSince20` warnings in logs.

### Pitfall 3: Supabase RLS Silent Failure

**What goes wrong:** RLS policies are written but data is visible/writable by all users.
**Why it happens:** `CREATE POLICY` without `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` first — policies exist but are not enforced.
**How to avoid:** Always pair `ENABLE ROW LEVEL SECURITY` with policy creation. Order matters: enable first, then create policies.
**Warning signs:** Supabase Dashboard shows policies exist but the table has a warning icon or "RLS Disabled" badge.

### Pitfall 4: Plasmo Side Panel Not Registering

**What goes wrong:** Extension loads but no side panel opens — Chrome shows no side panel option.
**Why it happens:** `sidepanel.tsx` placed in wrong location (e.g., `src/sidepanel/index.tsx`) or missing `"side_panel"` permission in Plasmo's auto-generated manifest.
**How to avoid:** Place entrypoint at `src/sidepanel.tsx` (flat). Plasmo auto-adds the manifest entry. Verify by checking `build/chrome-mv3-dev/manifest.json` after `npm run dev` — should contain `"side_panel": { "default_path": "sidepanel.html" }`.
**Warning signs:** `manifest.json` in the build output lacks the `side_panel` key.

### Pitfall 5: Docker Volume Mount Overwrites node_modules

**What goes wrong:** Extension or backend crashes because the volume mount overwrites the container's installed packages.
**Why it happens:** Mounting `./backend:/app` replaces `/app` including pip-installed packages if you're not careful. (Less common for Python since packages go to site-packages, not `/app` — but relevant if adding node-based tooling.)
**How to avoid:** For the backend, this is generally safe because pip installs to `/usr/local/lib/python3.11/site-packages`, not `/app`. Document this clearly.
**Warning signs:** `ModuleNotFoundError` after `docker compose up` when the module is in requirements.txt.

### Pitfall 6: CORS Blocking chrome-extension:// Origins

**What goes wrong:** Extension requests to `localhost:8000` are blocked by CORS.
**Why it happens:** Chrome extension origins are `chrome-extension://<id>` — not `http://` or `https://`. FastAPI's CORSMiddleware must explicitly allow this scheme.
**How to avoid:**
```python
allow_origins=["chrome-extension://*"]
# OR more permissive for local dev:
allow_origins=["*"]  # acceptable for localhost-only backend
```
**Warning signs:** Browser console shows `Access to fetch at 'http://localhost:8000/health' from origin 'chrome-extension://...' has been blocked by CORS policy`.

---

## Code Examples

Verified patterns from official sources / SRS spec:

### Router Stub Pattern

```python
# backend/app/routers/resume.py
from fastapi import APIRouter, HTTPException

router = APIRouter(tags=["resume"])

@router.post("/tailor-resume")
async def tailor_resume():
    raise HTTPException(status_code=501, detail="Not implemented — Phase 3")

@router.post("/generate-pdf")
async def generate_pdf():
    raise HTTPException(status_code=501, detail="Not implemented — Phase 3")
```

### Full Database Migration File

```sql
-- supabase/migrations/001_initial_schema.sql
CREATE TABLE users (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                TEXT,
  email               TEXT,
  linkedin_url        TEXT,
  github_url          TEXT,
  work_authorization  TEXT,
  base_resume_text    TEXT,
  created_at          TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE jobs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID REFERENCES users(id) ON DELETE CASCADE,
  company          TEXT,
  title            TEXT,
  url              TEXT,
  job_description  TEXT,
  status           TEXT DEFAULT 'saved',
  applied_at       TIMESTAMPTZ,
  notes            TEXT,
  created_at       TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE resumes (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID REFERENCES users(id) ON DELETE CASCADE,
  job_id       UUID REFERENCES jobs(id) ON DELETE SET NULL,
  resume_text  TEXT,
  pdf_url      TEXT,
  is_base      BOOLEAN DEFAULT false,
  created_at   TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE chat_messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id      UUID REFERENCES jobs(id) ON DELETE CASCADE,
  user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
  role        TEXT,
  content     TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE resumes ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "users_own" ON users FOR ALL USING (auth.uid() = id);
CREATE POLICY "jobs_own" ON jobs FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "resumes_own" ON resumes FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "chat_messages_own" ON chat_messages FOR ALL USING (auth.uid() = user_id);
```

```sql
-- supabase/migrations/002_form_qa_pairs.sql
CREATE TABLE form_qa_pairs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id           UUID REFERENCES jobs(id) ON DELETE CASCADE,
  user_id          UUID REFERENCES users(id) ON DELETE CASCADE,
  field_id         TEXT,
  question         TEXT,
  answer           TEXT,
  field_type       TEXT,
  edited_by_user   BOOLEAN DEFAULT false,
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now(),
  UNIQUE(job_id, field_id)
);

ALTER TABLE form_qa_pairs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "qa_pairs_own" ON form_qa_pairs FOR ALL USING (auth.uid() = user_id);
```

### Plasmo package.json manifest Config

```json
{
  "name": "jobpilot-extension",
  "displayName": "JobPilot",
  "version": "0.0.1",
  "description": "AI-powered job application assistant",
  "manifest": {
    "permissions": ["storage", "sidePanel", "tabs", "activeTab"],
    "side_panel": {
      "default_path": "sidepanel.html"
    }
  }
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Pydantic v1 `class Config` | Pydantic v2 `model_config = ConfigDict(...)` | Pydantic 2.0 (2023) | Breaking change — v1 shim exists but deprecated |
| Pydantic v1 `@validator` | Pydantic v2 `@field_validator` | Pydantic 2.0 (2023) | Old syntax emits warnings, will be removed |
| Chrome MV2 background pages | MV3 service workers | Chrome 2023+ | Service workers don't persist state — use chrome.storage |
| Plasmo popup.tsx in src/ | Plasmo entrypoints flat in src/ | Plasmo 0.80+ | sidepanel.tsx / popup.tsx / options.tsx — flat convention |
| `docker-compose` (v1 CLI) | `docker compose` (v2 CLI, space not hyphen) | Docker Desktop 2022+ | CLAUDE.md uses `docker compose` correctly |

**Deprecated/outdated:**
- `@validator` decorator in Pydantic: replaced by `@field_validator` — do not use.
- `response_model` with `.from_orm()`: replaced by `model_validate()` — do not use.
- Chrome MV2: Extension MUST use MV3 — Plasmo defaults to MV3, do not override.

---

## Open Questions

1. **Plasmo side panel file convention — SRS says `sidepanel/index.tsx`, Plasmo wants `sidepanel.tsx` (flat)**
   - What we know: Plasmo's entrypoint detection is file-name-based. Official Plasmo docs show flat files (`popup.tsx`, `options.tsx`, `sidepanel.tsx`) at the `src/` level.
   - What's unclear: The SRS Section 2.1 shows `sidepanel/index.tsx` as the root entrypoint. This contradicts Plasmo's convention.
   - Recommendation: Use `src/sidepanel.tsx` as the Plasmo entrypoint, and put sub-components in `src/components/sidepanel/`. The SRS file structure is a logical spec, not a filesystem prescription. Document the decision in the plan.

2. **WeasyPrint apt package names on Debian Bookworm (python:3.11-slim base)**
   - What we know: The packages needed are libcairo2, libpango, libgdk-pixbuf2.0-0, libffi-dev. The exact package names differ slightly across Debian versions.
   - What's unclear: `python:3.11-slim` uses Debian Bookworm (Debian 12) — package names should be stable, but `libgdk-pixbuf2.0-0` was renamed to `libgdk-pixbuf-2.0-0` in some versions.
   - Recommendation: Run `apt-cache search gdk-pixbuf` in the container to verify the exact package name. Dockerfile should be tested with a build before commit.

3. **Supabase auth.uid() in self-hosted single-user mode**
   - What we know: The RLS policies use `auth.uid()` which returns the authenticated user's UUID from Supabase Auth JWT.
   - What's unclear: In a truly self-hosted single-user deployment without Supabase Auth, `auth.uid()` may return NULL, making RLS block all operations.
   - Recommendation: Implement RLS policies as written (correct for multi-user / Supabase-hosted). Add a note that for self-hosted without auth, users can optionally disable RLS. This is a Phase 2 concern (config setup) not Phase 1.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | pytest 8.x + httpx (async test client for FastAPI) |
| Config file | `backend/pytest.ini` — Wave 0 gap |
| Quick run command | `cd backend && pytest tests/ -x -q` |
| Full suite command | `cd backend && pytest tests/ -v` |

No extension test infrastructure needed in Phase 1 (shell only — visual verification sufficient).

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SETUP-01 | `GET /health` returns 200 `{"status": "ok"}` | smoke | `pytest tests/test_health.py -x` | Wave 0 |
| SETUP-01 | CORS header present for `chrome-extension://` origin | smoke | `pytest tests/test_cors.py -x` | Wave 0 |
| SETUP-01 | All 7 router stubs return 501 Not Implemented | smoke | `pytest tests/test_stubs.py -x` | Wave 0 |
| SETUP-02 | All 5 tables exist in Supabase DB | manual | Supabase Dashboard → Table Editor | N/A — manual only |
| SETUP-02 | RLS enabled on all 5 tables | manual | Supabase Dashboard → Auth → Policies | N/A — manual only |
| SETUP-03 | Extension loads in Chrome without errors | manual | Chrome DevTools → Extensions panel | N/A — manual only |
| SETUP-03 | 4-tab side panel renders correctly | manual | Visual inspection in Chrome | N/A — manual only |
| SETUP-04 | `docker compose up` starts backend | smoke | `curl http://localhost:8000/health` | N/A — integration |

### Sampling Rate

- **Per task commit:** `cd /home/ikktaa/app/JobPilot/backend && pytest tests/ -x -q`
- **Per wave merge:** `cd /home/ikktaa/app/JobPilot/backend && pytest tests/ -v`
- **Phase gate:** Backend smoke tests green + manual visual check of extension + manual DB table verification before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `backend/pytest.ini` — pytest config pointing to `tests/` dir
- [ ] `backend/tests/__init__.py` — test package init
- [ ] `backend/tests/test_health.py` — covers SETUP-01 health check
- [ ] `backend/tests/test_cors.py` — covers SETUP-01 CORS for chrome-extension origins
- [ ] `backend/tests/test_stubs.py` — covers SETUP-01 all 7 router stubs return 501
- [ ] Framework install: `pip install pytest pytest-asyncio httpx` — in dev requirements

---

## Sources

### Primary (HIGH confidence)

- `docs/SRS.md` — All DB schemas (Section 4), file structure (Section 9), API contracts (Section 3), prompts (Section 5)
- `CLAUDE.md` — Locked tech stack, Docker setup, WeasyPrint deps, Pydantic v2 requirement
- `.planning/phases/01-foundation/01-CONTEXT.md` — All implementation decisions
- `.planning/REQUIREMENTS.md` — SETUP-01 through SETUP-04 requirement definitions

### Secondary (MEDIUM confidence)

- Pydantic v2 migration guide (pydantic.dev) — v1→v2 API changes verified against known breaking changes
- Plasmo documentation (docs.plasmo.com) — side panel entrypoint convention (flat file vs. subdirectory)
- Supabase RLS documentation — `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` being required before policies take effect

### Tertiary (LOW confidence)

- WeasyPrint Debian Bookworm package names — inferred from standard Debian package naming; should be verified empirically with `apt-cache search` during Dockerfile build

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — completely specified in CLAUDE.md and SRS.md
- Architecture: HIGH — SRS Section 9 is the authoritative file structure
- DB schema: HIGH — SRS Section 4 has exact SQL DDL
- API stubs: HIGH — SRS Section 3 has all endpoint signatures
- Plasmo entrypoint: MEDIUM — convention inferred from Plasmo's pattern; Open Question #1 flags this
- WeasyPrint apt packages: MEDIUM — likely correct, needs empirical Dockerfile test
- Pitfalls: HIGH — Pydantic v2, RLS, Docker volume pitfalls are well-documented

**Research date:** 2026-03-04
**Valid until:** 2026-04-04 (stable stack — 30 days)
