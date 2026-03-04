# Coding Conventions

**Analysis Date:** 2026-03-04

## Overview

JobPilot consists of two main codebases with distinct conventions:
- **Frontend (Extension):** Plasmo + React + TypeScript + Tailwind CSS
- **Backend (API):** FastAPI + Python 3.11+

Both follow clear conventions established in `CLAUDE.md` and enforced through linting/formatting tools.

---

## Naming Patterns

### Files (Frontend)

**Components:**
- PascalCase for TSX files: `TrackerTable.tsx`, `JobDetail.tsx`, `FillForm.tsx`
- Location: `extension/src/sidepanel/`, `extension/src/popup/`, `extension/src/options/`
- Pattern: Component name reflects its primary responsibility

**Content Script:**
- Lowercase with underscores: `content_script.ts`
- Location: `extension/src/contents/`

**Background Worker:**
- Lowercase with underscores: `background.ts`
- Location: `extension/src/background/`

**Utilities & Hooks:**
- camelCase for exported functions: `useJobStorage()`, `useSidePanel()`
- Files named to match export: `useJobStorage.ts` for hook, `api.ts` for API utilities

**Types & Constants:**
- PascalCase for types/interfaces: `FormField`, `JobEntry`, `ChatMessage`
- UPPER_SNAKE_CASE for constants: `MAX_RESUME_SIZE`, `API_TIMEOUT_MS`
- Locate in same file or dedicated `types.ts` file

### Files (Backend)

**Python modules:**
- snake_case: `ai_service.py`, `pdf_service.py`, `db_service.py`
- Location structure: `backend/app/routers/`, `backend/app/services/`, `backend/app/models/`

**Classes:**
- PascalCase: `AIService`, `PDFService`, `DatabaseService`, `ResumeSchema`

**Functions:**
- snake_case: `tailor_resume()`, `fill_form()`, `save_qa_pairs()`

**Constants:**
- UPPER_SNAKE_CASE: `DEFAULT_MODEL`, `MAX_TOKENS`, `TIMEOUT_SECONDS`

### Variables & Functions

**Frontend (TypeScript):**
- camelCase for variables: `selectedJobId`, `isLoading`, `formFields`
- camelCase for functions: `fetchJobDetail()`, `saveQAPair()`, `handleFormSubmit()`
- Boolean prefixes: `isLoading`, `hasError`, `canSubmit`, `shouldRetry`

**Backend (Python):**
- snake_case for variables: `selected_job_id`, `is_loading`, `form_fields`
- snake_case for functions: `fetch_job_detail()`, `save_qa_pair()`, `handle_form_submit()`
- Boolean prefixes: `is_loading`, `has_error`, `can_submit`, `should_retry`

### Types & Interfaces

**Frontend:**
- All interface definitions in TypeScript with strict typing
- Export from dedicated `types.ts` or co-located with component
- Example: `interface FormField { field_id: string; label: string; type: 'text' | 'textarea' | ... }`

**Backend (Pydantic):**
- Use Pydantic `BaseModel` for all request/response schemas
- Location: `backend/app/models/schemas.py`
- Naming: Request models end in `Request`, responses end in `Response`
- Example: `class FillFormRequest(BaseModel):` and `class FillFormResponse(BaseModel):`

---

## Code Style

### Formatting

**Frontend:**
- Tool: Prettier
- Config: `.prettierrc` in `extension/` root
- Line length: 80 characters
- Indentation: 2 spaces
- Semicolons: Always required
- Trailing commas: ES5-compatible (arrays/objects, not functions)

**Backend:**
- Tool: Black
- Line length: 88 characters (Black default)
- Indentation: 4 spaces
- Config: `pyproject.toml` in `backend/` root

### Linting

**Frontend:**
- Tool: ESLint
- Config: `.eslintrc.json` in `extension/` root
- Rules: Follow Airbnb config + Plasmo-specific rules
- Enforced rules:
  - No `any` type (use proper TypeScript)
  - No unused variables
  - No unreachable code
  - Consistent return types

**Backend:**
- Tool: pylint / flake8
- Config: `pyproject.toml` in `backend/` root
- Enforced:
  - No undefined variables
  - Import sorting (isort)
  - Line length compliance
  - Type hints on public functions

---

## Import Organization

### Frontend (TypeScript)

**Order (top to bottom):**
1. React and core framework imports: `import React from 'react'; import { useEffect } from 'react';`
2. Third-party libraries: `import { Button } from '@mui/material';`
3. Plasmo APIs: `import { useStorage } from '@plasmohq/storage/hook';`
4. Internal types: `import type { FormField, JobEntry } from '~/types';`
5. Internal components: `import TrackerTable from './TrackerTable';`
6. Internal utilities: `import { fetchAPI } from '~/utils/api';`
7. Styles: `import '~/styles/button.css';`

**Path aliases:**
- `~` → project root (configured in `tsconfig.json`)
- `@` → reserved for third-party (not used in this project)

### Backend (Python)

**Order (top to bottom):**
1. Standard library: `import os, sys, json`
2. Third-party: `from fastapi import FastAPI, HTTPException; from pydantic import BaseModel`
3. AI/ML libraries: `from litellm import completion`
4. Database: `from supabase import create_client`
5. Local imports: `from app.services.ai_service import AIService`
6. Absolute imports only (no relative imports)

**Import style:**
- Use absolute imports: `from app.services.ai_service import AIService`
- Avoid `from . import` patterns — breaks clarity across the codebase
- Group related imports together with blank lines between groups

---

## Error Handling

### Frontend

**Pattern 1: Try-Catch for Async:**
```typescript
async function fetchJobDetail(jobId: string) {
  try {
    const response = await fetch(`/api/job/${jobId}`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Failed to fetch job detail:', error);
    // Show user-facing toast/notification
    throw error; // Re-throw for caller to handle or display
  }
}
```

**Pattern 2: Custom Error Class:**
```typescript
class APIError extends Error {
  constructor(public status: number, public details: string) {
    super(`API Error (${status}): ${details}`);
    this.name = 'APIError';
  }
}
```

**Pattern 3: Error Boundaries (React):**
- Wrap entire side panel and key features with error boundaries
- Catch and display fallback UI instead of crashing

**When to throw vs. handle:**
- Throw: Network errors, critical validation failures, missing required data
- Handle: Expected validation errors (show user message), recoverable timeouts (retry), offline states (buffer in storage)

### Backend

**Pattern 1: HTTPException for API errors:**
```python
from fastapi import HTTPException

if not user_id:
    raise HTTPException(status_code=400, detail="user_id required")
if not found:
    raise HTTPException(status_code=404, detail="Job not found")
```

**Pattern 2: Custom Exception Classes:**
```python
class AIProviderError(Exception):
    """Raised when AI provider call fails."""
    pass

class DatabaseError(Exception):
    """Raised when database operation fails."""
    pass
```

**Pattern 3: Catch and log, then re-raise as HTTPException:**
```python
try:
    result = await ai_service.tailor_resume(jd, resume)
except AIProviderError as e:
    logger.error(f"AI service failed: {e}")
    raise HTTPException(status_code=503, detail="AI service unavailable")
```

**Validation errors:**
- Use Pydantic validation; FastAPI automatically converts `ValidationError` to 422 Unprocessable Entity
- Never return validation errors with 500 — use 400/422

---

## Logging

### Frontend

**Framework:** `console` object (browser native)

**Patterns:**
- Development: `console.log()` for tracing, `console.warn()` for unexpected states, `console.error()` for failures
- Production: Minimal console output; errors sent to backend telemetry endpoint (if enabled; see CLAUDE.md — currently disabled)
- Never log API keys, user data, or sensitive form content

**When to log:**
- Component mount/unmount in dev mode
- API request start/completion
- State changes in reducers
- User interactions (click, submit)
- Error details with full stack trace

### Backend

**Framework:** Python's `logging` module

**Configuration:** Set up in `backend/app/main.py`
```python
import logging
logger = logging.getLogger(__name__)
```

**Log levels:**
- `INFO`: API request received, job created, form processed
- `WARNING`: API timeout, missing optional field, fallback used
- `ERROR`: AI provider error, database error, validation failure
- `DEBUG`: Detailed input/output, AI prompt sent, response parsed (dev only)

**Patterns:**
```python
logger.info(f"Processing form fill for job {job_id}")
logger.error(f"AI service error: {error}", exc_info=True)
```

**IMPORTANT:** Never log API keys, resume content, form answers, or any user data. Log only operation metadata (IDs, counts, errors).

---

## Comments

### When to Comment

**Comments ARE needed for:**
- **Complex logic:** Multi-step algorithms, regex patterns, business rule implementations
- **Non-obvious choices:** Why a workaround exists, why a simpler approach won't work
- **Edge cases:** Why certain inputs are handled specially
- **Performance tricks:** Why a less-obvious approach was chosen for speed/memory

**Comments ARE NOT needed for:**
- Self-explanatory code (variable names, function names tell the story)
- Obvious loops, conditionals, assignments
- Every function definition (use JSDoc/TSDoc instead)

### JSDoc / TSDoc (Frontend)

**Required for:**
- Exported functions
- React components with props
- Complex utility functions
- Public types/interfaces

**Pattern:**
```typescript
/**
 * Fetches a job's full detail record from the backend.
 * @param jobId - UUID of the job
 * @returns Promise resolving to JobDetailResponse
 * @throws APIError if job not found or network fails
 */
async function fetchJobDetail(jobId: string): Promise<JobDetailResponse> {
  // ...
}

interface FormFieldProps {
  /** Field label displayed to user */
  label: string;
  /** Current field value */
  value: string;
  /** Called when user changes the input */
  onChange: (newValue: string) => void;
}
```

### Python Docstrings (Backend)

**Required for:**
- Functions and methods
- Classes
- Modules (top-level docstring)

**Pattern (Google-style):**
```python
def save_qa_pairs(job_id: str, qa_pairs: List[QAPairRequest]) -> int:
    """Saves or upserts Q&A pairs for a job.

    Args:
        job_id: UUID of the job.
        qa_pairs: List of question-answer pairs to save.

    Returns:
        Number of pairs successfully saved.

    Raises:
        DatabaseError: If database operation fails.
    """
```

---

## Function Design

### Size Guidelines

**Frontend functions:**
- Small: < 15 lines (most utility functions)
- Medium: 15-40 lines (component handlers, API wrappers)
- Large: 40-100 lines (complex hooks, form submissions)
- Avoid > 100 lines — split into smaller functions or extract to service

**Backend functions:**
- Small: < 20 lines (simple CRUD, data transforms)
- Medium: 20-50 lines (API endpoints, AI prompt handling)
- Large: 50-100 lines (complex business logic, multi-step processes)
- Avoid > 100 lines — extract to service class or helper

### Parameters

**Frontend:**
- Max 3-4 parameters; use object destructuring beyond that
- Use React props object for components
- Optional parameters use `?:` syntax

```typescript
// Good: Clear parameters
function saveQAPair(jobId: string, fieldId: string, answer: string) { }

// Better: Object when > 3 params
function saveQAPair(options: { jobId: string; fieldId: string; answer: string; edited?: boolean }) { }
```

**Backend:**
- Max 3-4 positional parameters; use Pydantic models for complex inputs
- Always include type hints

```python
# Good
def fill_form(job_id: str, form_fields: List[FormField], user_profile: UserProfile) -> List[Answer]:
    pass

# Avoid
def fill_form(job_id, fields, profile, context=None, **kwargs):
    pass
```

### Return Values

**Frontend:**
- Declare return type explicitly: `function foo(): Promise<JobDetail>`
- Null/undefined only when absence is semantically correct (optional data)
- Throw errors instead of returning error objects (use try-catch pattern)

**Backend:**
- Declare return type explicitly: `def foo() -> JobDetail:`
- Return Pydantic models for API responses (auto-serializes to JSON)
- Raise exceptions for errors, don't return `{ error: ... }` objects

---

## Module Design

### Exports (Frontend)

**Default export:** Component files only
```typescript
// TrackerTable.tsx — export default to enable Plasmo routing
export default function TrackerTable() { }
```

**Named exports:** Utilities, hooks, types
```typescript
// hooks/useJobStorage.ts
export function useJobStorage(jobId: string) { }

// types.ts
export interface FormField { }
export type JobStatus = 'saved' | 'applied' | ...;
```

**Barrel files:** Create `index.ts` to re-export related utilities
```typescript
// utils/index.ts
export { fetchAPI } from './api';
export { parseFormFields } from './form-parser';
```

### Exports (Backend)

**Router modules:** Import and register in `main.py`
```python
# app/routers/resume.py
from fastapi import APIRouter
router = APIRouter(prefix="/api")

@router.post("/tailor-resume")
async def tailor_resume(...): pass

# app/main.py
from app.routers import resume
app.include_router(resume.router)
```

**Service classes:** Instantiate in `main.py` or inject into routes
```python
# app/services/ai_service.py
class AIService:
    def __init__(self, api_key: str):
        self.api_key = api_key

# app/routers/resume.py
ai_service = AIService(api_key=os.getenv("AI_API_KEY"))

@router.post("/tailor-resume")
async def tailor_resume(req: TailorResumeRequest):
    return await ai_service.tailor_resume(...)
```

**Models (Pydantic):** All in `backend/app/models/schemas.py`
```python
# app/models/schemas.py
class FormFieldResponse(BaseModel):
    field_id: str
    label: str
    answer: str
    field_type: str

class FillFormResponse(BaseModel):
    answers: List[FormFieldResponse]
    qa_saved: bool
```

---

## Special Patterns

### Chrome Storage (Frontend)

**Pattern for storing configuration:**
```typescript
// Store
await chrome.storage.local.set({ user_profile: { name: 'John' } });

// Retrieve
const data = await chrome.storage.local.get('user_profile');

// Use in React hook
function useUserProfile() {
  const [profile, setProfile] = useState<UserProfile | null>(null);

  useEffect(() => {
    chrome.storage.local.get('user_profile', (result) => {
      setProfile(result.user_profile || null);
    });
  }, []);

  return profile;
}
```

**Keys (from SRS):**
- `user_profile` — Name, contact, work auth, LinkedIn
- `ai_config` — Provider, API key, model, backend URL
- `db_config` — Supabase URL + key
- `current_job` — Active JD + form fields
- `pending_qa_pairs` — Unsaved Q&A (offline buffer)

### LiteLLM Calls (Backend)

**Pattern: Always use LiteLLM, never raw SDK:**
```python
from litellm import completion

# Load prompt from file
with open('app/prompts/tailor_resume.txt', 'r') as f:
    prompt_template = f.read()

prompt = prompt_template.format(job_description=jd, base_resume=resume)

response = completion(
    model=model_name,  # e.g., "gpt-4", "claude-3-opus", "ollama/mistral"
    messages=[{"role": "user", "content": prompt}],
    api_key=api_key,
)
```

**Never do:**
```python
# ❌ DON'T use direct SDK imports
from openai import OpenAI
client = OpenAI(api_key=api_key)
client.chat.completions.create(...)
```

### Prompt Management

**Location:** `backend/app/prompts/*.txt` (plain text files, loaded at runtime)

**Pattern:**
```python
def load_prompt(filename: str) -> str:
    """Load prompt template from file."""
    path = Path(__file__).parent / 'prompts' / filename
    return path.read_text()

# Usage
tailor_prompt = load_prompt('tailor_resume.txt')
resume_text = tailor_prompt.format(
    job_description=jd,
    base_resume=resume
)
```

**Form fill responses:**
- Prompt MUST instruct AI to return **only valid JSON** — no markdown fences, no preamble
- Response parsed with `json.loads()` — must be strict

### Supabase Operations (Backend)

**Pattern: Create client in service class**
```python
from supabase import create_client

class DatabaseService:
    def __init__(self, url: str, key: str):
        self.client = create_client(url, key)

    async def fetch_job(self, job_id: str):
        response = self.client.table('jobs').select('*').eq('id', job_id).execute()
        return response.data[0] if response.data else None

    async def upsert_qa_pairs(self, job_id: str, pairs: List[QAPair]):
        # Upsert on (job_id, field_id) unique constraint
        response = self.client.table('form_qa_pairs').upsert(
            [{ 'job_id': job_id, 'field_id': p.field_id, 'answer': p.answer } for p in pairs]
        ).execute()
        return len(response.data)
```

---

## TypeScript-Specific Rules

### Type Strictness

**Enable strict mode (tsconfig.json):**
- `"strict": true` — Enforces all strict type checks
- `"noImplicitAny": true` — No bare `any` types
- `"noNullUndef": true` — Null/undefined must be explicit
- `"strictNullChecks": true` — Included in strict mode

**Union types for optionality (prefer to optional):**
```typescript
// Better: Explicit union
function foo(value: string | null): void { }

// Avoid: Optional parameter (less flexible)
function foo(value?: string): void { }
```

### React Best Practices

**Hooks:**
- Always placed at top level, not conditionally
- Custom hooks must start with `use` prefix
- Dependencies array must be exhaustive (ESLint checks)

**Component props:**
- Define interface/type for all props
- Use `React.FC<Props>` or plain function with return type annotation
- Use object destructuring in parameters

```typescript
interface ButtonProps {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}

export default function Button({ label, onClick, disabled }: ButtonProps) {
  return <button onClick={onClick} disabled={disabled}>{label}</button>;
}
```

---

## Python-Specific Rules

### Type Hints

**All public functions and methods must have type hints:**
```python
def fetch_job(job_id: str) -> Optional[Job]:
    pass

def save_qa_pairs(job_id: str, pairs: List[QAPair]) -> int:
    pass
```

**Use standard library types where possible:**
```python
from typing import Optional, List, Dict, Tuple
from pathlib import Path

def process_items(items: List[str]) -> Dict[str, int]:
    pass
```

### Async/Await

**Backend endpoints must be async:**
```python
@router.post("/fill-form")
async def fill_form(request: FillFormRequest):
    result = await ai_service.fill_form(...)
    return result
```

**Use `await` for I/O (database, API calls):**
```python
async def fetch_job(job_id: str):
    # Supabase client is sync; wrap in async context if needed
    job = self.db.table('jobs').select('*').eq('id', job_id).execute()
    return job.data[0] if job.data else None
```

---

## Collaboration & Code Review

**Pull Request guidelines:**
- Link to issue/task in description
- Keep PRs under 400 lines when possible
- Run formatter and linter before pushing
- Request review from 1-2 teammates
- Include before/after for UI changes

**Commit messages:**
- Imperative mood: "Add form field parser" not "Added parser"
- First line: max 72 characters
- Body: explain *why*, not *what*
- Reference issue: "Fixes #123"

---

*Conventions analysis: 2026-03-04*
