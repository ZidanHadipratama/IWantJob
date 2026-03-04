# External Integrations

**Analysis Date:** 2026-03-04

## APIs & External Services

**AI Provider Integrations (via LiteLLM):**
- **OpenAI** - ChatGPT models for resume tailoring, form fill, chat coaching
  - SDK: None directly; use LiteLLM backend wrapper
  - Auth: User-provided API key via `X-API-Key` header (never stored server-side)
  - Models supported: gpt-4, gpt-3.5-turbo, etc.

- **Anthropic** - Claude models alternative
  - SDK: None directly; use LiteLLM backend wrapper
  - Auth: User-provided API key via `X-API-Key` header
  - Models supported: claude-opus, claude-sonnet, etc.

- **Google Gemini** - Gemini model alternative
  - SDK: None directly; use LiteLLM backend wrapper
  - Auth: User-provided API key via `X-API-Key` header
  - Models supported: gemini-pro, etc.

- **Ollama** - Local LLM inference (self-hosted)
  - SDK: None directly; use LiteLLM backend wrapper
  - Auth: Local endpoint, no API key required
  - Endpoint: Configurable backend URL in extension settings

**Backend**: `backend/app/services/` contains LiteLLM wrappers for all AI calls

## Data Storage

**Databases:**
- **Supabase (PostgreSQL)**
  - Connection: Via `SUPABASE_URL` and `SUPABASE_KEY` environment variables (backend)
  - Client: `supabase-js` (extension), `supabase-py` or `psycopg2` (backend)
  - Auth: Service key (backend requests); anon key (extension reads)
  - Tables: `users`, `jobs`, `form_qa_pairs`, `resumes`, `chat_messages`
  - User owns the Supabase instance; no central SaaS storage

**File Storage:**
- **Supabase Storage** (PostgreSQL-backed, optional)
  - Stores generated PDFs (24-hour TTL)
  - Alternative: Local temp files on backend server
  - PDFs referenced by `pdf_url` field in `resumes` table

**Caching:**
- **chrome.storage.local** (extension only)
  - Caches pending Q&A pairs (`pending_qa_pairs` key) for offline resilience
  - No server-side caching layer specified; stateless FastAPI

## Authentication & Identity

**Auth Provider:**
- **Self-managed** (no third-party auth service)
  - Implementation: Extension/Backend uses `user_id` UUID stored in Supabase
  - No login required; extension authenticated via Supabase anon key + user-provided Supabase URL
  - Multi-user support via `user_id` foreign key in all tables (even single-user self-hosted deployments)

**API Key Management:**
- AI provider keys: Stored in extension `chrome.storage.local` only (never sent to backend storage)
- Passed per-request in `X-API-Key` HTTP header
- Backend validates and sanitizes before passing to LiteLLM

## Monitoring & Observability

**Error Tracking:**
- Not detected; no central error tracking service (Sentry, etc.)
- Backend likely logs errors locally or to stdout (Docker container logs)

**Logs:**
- **Backend**: FastAPI uvicorn logs → Docker container stdout
- **Extension**: Browser console logs (chrome.storage logs, fetch errors)
- No persistent logging or telemetry; all logs are ephemeral

**Policy**: No logging of user content (JDs, resumes, Q&A pairs, chat) per security guidelines

## CI/CD & Deployment

**Hosting:**
- **Local Development**: `docker compose up` for backend; Plasmo dev server for extension
- **Production Options**:
  - Railway, Render, or custom VPS: Docker container deployment
  - Chrome Web Store: Manual or automated extension submission
  - Self-hosted: User runs `docker compose up` on private server

**CI Pipeline:**
- Not detected; no GitHub Actions, Jenkins, etc. configured
- Deployment is manual or via cloud provider's one-click deploy button

**Docker:**
- `backend/docker-compose.yml` - Defines backend service + PostgreSQL/Redis dependencies
- `backend/Dockerfile` - Builds FastAPI image
- Env vars passed via `.env` or environment configuration

## Environment Configuration

**Required env vars (Backend):**
- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_KEY` - Supabase service/anon key
- `PYTHON_VERSION` - Default 3.11 (if using `.python-version`)
- `LITELLM_*` - Provider-specific config (optional; mostly handled via request headers)

**Required env vars (Extension):**
- Stored in `chrome.storage.local`, not .env files:
  - `user_profile` - User name, email, LinkedIn
  - `ai_config` - Provider type, API key, model name, backend URL (default: `http://localhost:8000`)
  - `db_config` - Supabase URL, anon key

**Secrets location:**
- **Extension**: `chrome.storage.local` (encrypted by Chrome; no plaintext env files)
- **Backend**: Environment variables or Docker secrets
- `.env` file: Present locally, never committed (listed in `.gitignore`)

## Webhooks & Callbacks

**Incoming:**
- None detected; no external webhooks received

**Outgoing:**
- None detected; no webhooks sent to external services
- Form fill results returned directly via synchronous HTTP response

---

*Integration audit: 2026-03-04*
