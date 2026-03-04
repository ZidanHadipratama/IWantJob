# Stack Research

**Project:** JobPilot
**Researched:** 2026-03-04
**Confidence:** HIGH (stack is pre-decided; research validates choices and identifies version/compatibility concerns)

---

## Recommended Stack (Validated)

The tech stack is defined in CLAUDE.md and SRS.md. Research validates each choice and identifies current best practices.

### Extension Layer

| Technology | Version | Role | Confidence |
|-----------|---------|------|------------|
| Plasmo | ~0.90.x | Extension framework — MV3-first, handles service worker + side panel + content scripts via filesystem conventions | HIGH |
| React | 18.3.x | UI components for side panel, popup, options page | HIGH |
| TypeScript | 5.4.x | Type safety across extension codebase | HIGH |
| Tailwind CSS | 3.4.x | Utility-first styling | HIGH |
| @plasmohq/messaging | latest | Type-safe messaging between content script, background, side panel | HIGH |
| @plasmohq/storage | latest | Typed wrapper around chrome.storage API | HIGH |

**Plasmo rationale:** Handles MV3 service worker lifecycle, content script injection, side panel registration, and hot reload out of the box. The filesystem-based routing (`src/contents/`, `src/background/`, `src/sidepanel/`) maps exactly to the SRS file structure. Alternative (CRXJS) has less active maintenance.

**Key Plasmo patterns:**
- Side panel: register via `sidepanel/index.tsx` — Plasmo handles the manifest entry
- Content scripts: place in `contents/` directory — auto-injected based on config export
- Background: `background/index.ts` — Plasmo handles service worker registration
- Messaging: use `@plasmohq/messaging` for type-safe chrome.runtime message passing

### Backend Layer

| Technology | Version | Role | Confidence |
|-----------|---------|------|------------|
| FastAPI | ~0.111.x | Async HTTP API framework | HIGH |
| Uvicorn | ~0.29.x | ASGI server for FastAPI | HIGH |
| Pydantic | v2 (2.7.x) | Request/response validation — use v2, NOT v1 | HIGH |
| LiteLLM | ~1.40.x | AI provider abstraction (OpenAI/Anthropic/Gemini/Ollama) | HIGH |
| WeasyPrint | ~62.x | HTML/CSS to PDF conversion | HIGH |
| pdfplumber | ~0.11.x | Extract text from uploaded PDF resumes | HIGH |
| Python | 3.11+ | Runtime | HIGH |

**LiteLLM critical notes:**
- Pin to exact minor version (not `^` or `~` range) — LiteLLM ships weekly with breaking changes
- Use `response_format={"type": "json_object"}` for fill-form calls to enforce JSON-only output
- Model prefix convention: `gpt-4o`, `claude-3-opus-20240229`, `ollama/llama3`, `gemini/gemini-pro`
- Pass `api_key` per-call, not via env var — matches BYOK model

**WeasyPrint critical notes:**
- Requires Cairo and Pango system dependencies — must be installed in Docker image
- Use `python:3.11-slim` base image with explicit `apt-get install` for `libcairo2`, `libpango-1.0-0`, `libgdk-pixbuf2.0-0`
- Does NOT support CSS Grid or Flexbox — use CSS tables/floats for resume layout
- This is the most likely Docker build pitfall

**Pydantic v2 critical notes:**
- v2 uses `model_validator` instead of `validator`, `model_config` instead of `class Config`
- Many tutorials still show v1 patterns — verify all examples against v2 docs
- FastAPI 0.100+ requires Pydantic v2

### Database Layer

| Technology | Version | Role | Confidence |
|-----------|---------|------|------------|
| Supabase | hosted (free tier) | PostgreSQL database, user-owned | HIGH |
| supabase-py | v2.x | Python client for Supabase — async client | HIGH |
| PostgreSQL | 15+ (via Supabase) | Underlying database engine | HIGH |

**supabase-py v2 critical notes:**
- v2 uses async client — matches FastAPI's async handlers
- v1 patterns (seen in many tutorials) won't work — watch for `create_client` vs `create_async_client`
- Connection string goes in extension's chrome.storage.local, passed to backend per-request or configured in backend env

### Containerization

| Technology | Version | Role | Confidence |
|-----------|---------|------|------------|
| Docker | latest | Container runtime | HIGH |
| Docker Compose | v2 | Multi-service orchestration | HIGH |

---

## What NOT to Use

| Technology | Why Not |
|-----------|---------|
| CRXJS | Less active maintenance than Plasmo, weaker MV3 support |
| openai SDK (direct) | Violates LiteLLM abstraction — breaks multi-provider support |
| anthropic SDK (direct) | Same — always go through LiteLLM |
| Puppeteer/Playwright | Not needed — content scripts read DOM directly |
| react-router | No URL routing in side panel — use selectedJobId state |
| Redux/Zustand | Overkill for side panel state — React useState + chrome.storage sufficient |
| Supabase JS client in extension | Extension must NOT call DB directly — all through backend API |
| ReportLab (PDF) | WeasyPrint is already chosen and more suitable for HTML→PDF |

---

## Development Dependencies

```json
// extension/package.json (key deps)
{
  "dependencies": {
    "plasmo": "~0.90.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "@plasmohq/messaging": "latest",
    "@plasmohq/storage": "latest"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "tailwindcss": "^3.4.0",
    "postcss": "^8.4.0",
    "autoprefixer": "^10.4.0"
  }
}
```

```txt
# backend/requirements.txt (key deps)
fastapi==0.111.0
uvicorn==0.29.0
pydantic==2.7.0
litellm==1.40.0
weasyprint==62.0
pdfplumber==0.11.0
supabase==2.4.0
python-multipart==0.0.9
```

---

## Version Verification Commands

Run these before scaffolding to confirm latest versions:

```bash
npm info plasmo version
pip index versions litellm
pip index versions fastapi
pip index versions weasyprint
pip index versions supabase
```

---

## Sources

- CLAUDE.md — tech stack decisions (HIGH confidence)
- docs/SRS.md — full architecture and API specs (HIGH confidence)
- Training knowledge through 2025 — library versions and patterns (MEDIUM confidence on exact version numbers)

---

*Stack research: 2026-03-04*
