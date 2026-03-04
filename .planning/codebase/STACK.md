# Technology Stack

**Analysis Date:** 2026-03-04

## Languages

**Primary:**
- **TypeScript** - Extension UI, content scripts, background service workers (`extension/src/**/*.ts`, `extension/src/**/*.tsx`)
- **Python** 3.11+ - Backend FastAPI service (`backend/app/`)

**Secondary:**
- **SQL** - Supabase PostgreSQL schemas (`supabase/migrations/`)

## Runtime

**Environment:**
- **Node.js** (version managed via `.nvmrc` in extension directory) - Extension build and dev server
- **Python 3.11+** - Backend service runtime

**Package Manager:**
- **npm** (Node Package Manager) - Extension dependencies and build scripts
- **pip** (Python package manager) - Backend dependencies

## Frameworks

**Frontend:**
- **Plasmo** - Chrome extension framework (not vanilla CRX or CRXJS)
- **React** - Extension UI component library
- **Tailwind CSS** - Styling for extension components

**Backend:**
- **FastAPI** - REST API framework for Python 3.11+
  - Automatic OpenAPI/Swagger docs at `http://localhost:8000/docs`
  - Async request handling

**AI/ML:**
- **LiteLLM** - Unified AI provider abstraction layer
  - Supports OpenAI, Anthropic, Gemini, Ollama
  - Never use OpenAI/Anthropic SDKs directly—always via LiteLLM
  - Backend-only usage; AI calls from extension route through backend

**PDF Generation:**
- **WeasyPrint** - Resume PDF generation from HTML/CSS

**Document Parsing:**
- **pdfplumber** - Resume PDF parsing and text extraction

## Key Dependencies

**Critical:**
- **supabase-js** (extension) - Supabase client for extension context
- **supabase-py** or **psycopg2** (backend) - PostgreSQL connection management
- **litellm** (backend) - All AI provider integrations
- **weasyprint** (backend) - PDF generation
- **pdfplumber** (backend) - Resume PDF parsing

**Infrastructure:**
- **Docker** - Backend containerization
- **Docker Compose** - Local backend + dependency orchestration
- **PostgreSQL** - Underlying database (via Supabase)

## Configuration

**Environment:**
Extension configuration stored in `chrome.storage.local` keys:
- `user_profile` - Name, contact info, work auth, LinkedIn
- `ai_config` - AI provider (OpenAI/Anthropic/Gemini/Ollama), API key, model name, backend URL
- `db_config` - Supabase URL and anon key
- `current_job` - Active JD + extracted form fields (session storage)
- `pending_qa_pairs` - Offline buffer for unsaved Q&A pairs

Backend environment variables:
- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_KEY` - Supabase anon key
- `LITELLM_*` - LiteLLM provider configuration (not stored in backend; passed per-request in `X-API-Key` header)

**Build:**
- **tsconfig.json** - TypeScript configuration (extension)
- **Plasmo build config** - Implicit; respects `src/` directory structure
- **.nvmrc** - Node version lockfile (extension)
- **Docker** - Backend containerization via `docker-compose.yml` and `Dockerfile`
- **Supabase migrations** - Located in `supabase/migrations/` (empty at startup; applied via Supabase CLI or Dashboard)

## Platform Requirements

**Development:**
- Chrome/Chromium browser (for extension loading and testing)
- Node.js + npm (extension build)
- Python 3.11+ (backend)
- Docker + Docker Compose (backend service orchestration)
- Supabase project (cloud or self-hosted)

**Production:**
- Chrome Web Store (or manual unpacked installation for self-hosted)
- Cloud hosting (Railway, Render, custom server) or Docker on private server
- Supabase instance (user-owned; no central SaaS)
- User's own AI provider account (OpenAI, Anthropic, Gemini, or local Ollama)

---

*Stack analysis: 2026-03-04*
