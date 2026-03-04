# Testing Patterns

**Analysis Date:** 2026-03-04

## Overview

JobPilot uses different testing strategies for frontend (Chrome extension) and backend (FastAPI). Both prioritize integration tests over unit tests, testing real user workflows.

---

## Frontend Testing (React + TypeScript)

### Test Framework

**Runner:**
- `Vitest` (not Jest — faster, better ES modules support)
- Config: `extension/vitest.config.ts`

**Assertion Library:**
- `@testing-library/react` for component testing
- `vitest` built-in assertions for unit tests

**Run Commands:**
```bash
# From extension/ directory
npm test                    # Run all tests once
npm run test:watch         # Watch mode (re-run on file change)
npm run test:coverage      # Generate coverage report
npm run test:ui            # Open Vitest UI dashboard
```

---

## Test File Organization

### Location & Naming

**Pattern:** Co-located with source files

```
extension/src/
├── sidepanel/
│   ├── TrackerTable.tsx
│   ├── TrackerTable.test.tsx       ← Test lives next to component
│   ├── JobDetail.tsx
│   └── JobDetail.test.tsx
├── hooks/
│   ├── useJobStorage.ts
│   └── useJobStorage.test.ts
└── utils/
    ├── api.ts
    └── api.test.ts
```

**Naming convention:** `[ComponentName].test.tsx` or `[utility].test.ts`

### Test File Structure

**Basic template:**
```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import TrackerTable from './TrackerTable';

describe('TrackerTable', () => {
  beforeEach(() => {
    // Setup: mock storage, mock API, etc.
  });

  afterEach(() => {
    // Cleanup: clear mocks, reset state
    vi.clearAllMocks();
  });

  it('displays job list from storage', async () => {
    // Arrange: setup test data
    const mockJobs = [{ id: '123', company: 'Acme', title: 'Engineer' }];

    // Act: render and interact
    render(<TrackerTable jobs={mockJobs} />);

    // Assert: verify outcome
    expect(screen.getByText('Acme')).toBeInTheDocument();
  });
});
```

---

## Component Testing Patterns

### Example 1: Testing with Props

```typescript
describe('FillForm', () => {
  it('displays form fields extracted from page', async () => {
    const mockFields = [
      { field_id: 'email', label: 'Email', type: 'text' },
      { field_id: 'message', label: 'Message', type: 'textarea' },
    ];

    render(<FillForm fields={mockFields} onSubmit={vi.fn()} />);

    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Message')).toBeInTheDocument();
  });
});
```

### Example 2: Testing User Interaction

```typescript
describe('TrackerTable', () => {
  it('opens job detail when row is clicked', async () => {
    const mockOnSelectJob = vi.fn();
    const mockJobs = [{ id: '123', company: 'Acme', title: 'Engineer' }];

    render(<TrackerTable jobs={mockJobs} onSelectJob={mockOnSelectJob} />);

    const row = screen.getByText('Acme').closest('tr');
    fireEvent.click(row!);

    expect(mockOnSelectJob).toHaveBeenCalledWith('123');
  });
});
```

### Example 3: Testing Async Operations

```typescript
describe('Resume Component', () => {
  it('fetches and displays tailored resume', async () => {
    const mockFetchResume = vi.fn().mockResolvedValue({
      tailored_resume_text: 'Tailored content...',
      pdf_url: 'https://example.com/resume.pdf',
    });

    render(<Resume jobId="123" onFetch={mockFetchResume} />);

    // Wait for async operation to complete
    await waitFor(() => {
      expect(screen.getByText(/Tailored content/)).toBeInTheDocument();
    });

    expect(mockFetchResume).toHaveBeenCalledWith('123');
  });
});
```

### Example 4: Testing Storage Interaction

```typescript
describe('JobDetail', () => {
  it('saves job to chrome.storage when form submitted', async () => {
    const mockStorageSet = vi.fn();
    vi.stubGlobal('chrome', {
      storage: {
        local: { set: mockStorageSet },
      },
    });

    render(<JobDetail jobId="123" />);

    fireEvent.click(screen.getByText('Save'));

    expect(mockStorageSet).toHaveBeenCalledWith(
      expect.objectContaining({ pending_qa_pairs: expect.any(Array) })
    );
  });
});
```

---

## Mocking Patterns

### Mocking API Calls

**Pattern: Mock fetch function**
```typescript
import { vi } from 'vitest';

beforeEach(() => {
  global.fetch = vi.fn((url: string) => {
    if (url.includes('/job/')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          id: '123',
          company: 'Acme',
          title: 'Engineer',
        }),
      });
    }
    return Promise.reject(new Error('Not found'));
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});
```

**Better: Use mock library (MSW - Mock Service Worker)**
```typescript
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';

const server = setupServer(
  http.get('/api/job/:id', ({ params }) => {
    return HttpResponse.json({ id: params.id, company: 'Acme' });
  })
);

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
```

### Mocking Chrome APIs

```typescript
const mockChrome = {
  storage: {
    local: {
      get: vi.fn((key, callback) => {
        callback({ [key]: 'mocked-value' });
      }),
      set: vi.fn((obj, callback) => {
        callback();
      }),
    },
  },
  tabs: {
    query: vi.fn(() => Promise.resolve([{ id: 1, url: 'https://example.com' }])),
  },
};

vi.stubGlobal('chrome', mockChrome);
```

### Mocking Custom Hooks

```typescript
import { renderHook, act } from '@testing-library/react';
import { useJobStorage } from './useJobStorage';

describe('useJobStorage', () => {
  it('returns job from storage', async () => {
    vi.mocked(chrome.storage.local.get).mockImplementation((key, callback) => {
      callback({
        current_job: { id: '123', company: 'Acme' },
      });
    });

    const { result } = renderHook(() => useJobStorage());

    await act(async () => {
      // Wait for async hook initialization
    });

    expect(result.current.job?.company).toBe('Acme');
  });
});
```

---

## What to Mock vs. What NOT to Mock

### MOCK:
- External API calls (backend, LLM providers)
- `chrome.storage` and `chrome.tabs` APIs
- File downloads
- Third-party SDK calls
- Date/time (when testing time-dependent logic)

### DO NOT MOCK:
- React component rendering
- DOM queries and interactions
- Custom hooks logic (test behavior, not implementation)
- Utility functions (test as-is)
- CSS/styling (use snapshot tests sparingly)

---

## Fixtures and Factories

### Test Data Factory

**Location:** `extension/src/__tests__/fixtures.ts`

```typescript
// fixtures.ts
export const createMockJob = (overrides?: Partial<Job>): Job => ({
  id: 'job-123',
  company: 'Acme Corp',
  title: 'Senior Engineer',
  url: 'https://acme.example.com/jobs/123',
  status: 'applied',
  applied_at: new Date('2025-01-15'),
  notes: 'Great team, interested',
  ...overrides,
});

export const createMockFormField = (overrides?: Partial<FormField>): FormField => ({
  field_id: 'field-1',
  label: 'Experience',
  name: 'experience',
  type: 'textarea',
  required: true,
  ...overrides,
});

// Usage in tests
it('renders job data', () => {
  const job = createMockJob({ company: 'TechCorp' });
  render(<JobDetail job={job} />);
  expect(screen.getByText('TechCorp')).toBeInTheDocument();
});
```

### Fixture Files (JSON)

**Location:** `extension/src/__tests__/fixtures/`

```
fixtures/
├── jobs.json
├── form-fields.json
└── chat-messages.json
```

**Usage:**
```typescript
import jobsFixture from './__tests__/fixtures/jobs.json';

it('renders job list', () => {
  render(<TrackerTable jobs={jobsFixture} />);
  expect(screen.getByText('Acme')).toBeInTheDocument();
});
```

---

## Coverage

### Target Coverage

**Extension:**
- Utility functions: 100% (all paths)
- Components: 80%+ (interactions, error states)
- Hooks: 80%+ (with/without data, error cases)
- Overall: 70%+ (not enforced, tracked for improvement)

### View Coverage

```bash
# Generate HTML report
npm run test:coverage

# View report
open coverage/index.html
```

**Coverage threshold config (vitest.config.ts):**
```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      lines: 70,
      functions: 70,
      branches: 60,
      statements: 70,
    },
  },
});
```

---

## Backend Testing (FastAPI)

### Test Framework

**Runner:**
- `pytest`
- Config: `backend/pytest.ini` or `pyproject.toml`

**Async support:**
- `pytest-asyncio` for testing async endpoints

**Mocking:**
- `pytest-mock` or `unittest.mock` (built-in)

**Run Commands:**
```bash
# From backend/ directory
pytest                      # Run all tests
pytest -v                   # Verbose (show each test)
pytest -s                   # Show print statements
pytest tests/routers/       # Run specific directory
pytest -k "test_fill_form"  # Run tests matching pattern
pytest --cov=app            # Generate coverage report
pytest --cov=app --cov-report=html  # HTML coverage report
```

---

## Backend Test Structure

### File Organization

```
backend/
├── app/
│   ├── main.py
│   ├── routers/
│   │   ├── resume.py
│   │   └── form.py
│   └── services/
│       ├── ai_service.py
│       └── db_service.py
└── tests/
    ├── conftest.py                 # Pytest fixtures
    ├── test_main.py
    ├── routers/
    │   ├── test_resume.py          # Tests for resume.py
    │   └── test_form.py            # Tests for form.py
    └── services/
        ├── test_ai_service.py      # Tests for ai_service.py
        └── test_db_service.py      # Tests for db_service.py
```

### Test File Template

```python
# tests/routers/test_resume.py
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.models.schemas import TailorResumeRequest, TailorResumeResponse

client = TestClient(app)

@pytest.fixture
def mock_ai_service(mocker):
    """Mock the AI service to avoid real API calls."""
    mock = mocker.patch('app.routers.resume.ai_service')
    mock.tailor_resume.return_value = "Tailored resume text..."
    return mock

def test_tailor_resume_success(mock_ai_service):
    """Test successful resume tailoring."""
    request = TailorResumeRequest(
        job_description="Senior Engineer role...",
        base_resume="My resume...",
        job_id="job-123"
    )

    response = client.post('/tailor-resume', json=request.dict())

    assert response.status_code == 200
    assert 'tailored_resume_text' in response.json()
    mock_ai_service.tailor_resume.assert_called_once()

def test_tailor_resume_missing_job_description():
    """Test validation error when JD is missing."""
    request = {'base_resume': 'My resume...'}

    response = client.post('/tailor-resume', json=request)

    assert response.status_code == 422  # Validation error
    assert 'job_description' in response.json()['detail'][0]['loc']
```

### Testing Async Endpoints

```python
@pytest.mark.asyncio
async def test_fill_form_async(mock_ai_service, mock_db_service):
    """Test async form filling endpoint."""
    request = FillFormRequest(
        form_fields=[FormField(field_id='email', label='Email', type='text')],
        resume_text='My resume...',
        user_profile=UserProfile(name='John', email='john@example.com'),
        job_id='job-123'
    )

    response = client.post('/fill-form', json=request.dict())

    assert response.status_code == 200
    assert response.json()['qa_saved'] is True
    mock_db_service.save_qa_pairs.assert_called_once()
```

---

## Mocking Patterns (Backend)

### Mocking External Services

**Pattern 1: Mock AI Service**
```python
def test_tailor_resume_handles_ai_error(mocker):
    """Test graceful error handling when AI service fails."""
    mock_ai = mocker.patch('app.routers.resume.ai_service')
    mock_ai.tailor_resume.side_effect = Exception("AI unavailable")

    response = client.post('/tailor-resume', json={
        'job_description': 'Engineer role',
        'base_resume': 'My resume'
    })

    assert response.status_code == 503
    assert 'unavailable' in response.json()['detail']
```

**Pattern 2: Mock Database**
```python
def test_save_job_creates_entry(mocker):
    """Test job logging saves to database."""
    mock_db = mocker.patch('app.routers.jobs.db_service')
    mock_db.create_job.return_value = {
        'id': 'job-123',
        'company': 'Acme',
        'title': 'Engineer'
    }

    response = client.post('/log-job', json={
        'company': 'Acme',
        'title': 'Engineer',
        'url': 'https://acme.example.com'
    })

    assert response.status_code == 201
    assert response.json()['id'] == 'job-123'
```

**Pattern 3: Mock Supabase Client**
```python
@pytest.fixture
def mock_supabase_client(mocker):
    """Mock Supabase to avoid real database calls."""
    mock = mocker.MagicMock()
    mock.table('jobs').select.return_value.eq.return_value.execute.return_value.data = [
        {'id': 'job-123', 'company': 'Acme'}
    ]
    return mock

def test_fetch_job_returns_data(mocker, mock_supabase_client):
    mocker.patch('app.services.db_service.create_client', return_value=mock_supabase_client)

    # Test code here
```

### Mocking LiteLLM

```python
def test_form_fill_parsing(mocker):
    """Test that form fill responses are parsed correctly."""
    mock_completion = mocker.patch('app.services.ai_service.completion')
    mock_completion.return_value.choices[0].message.content = '''[
      {"field_id": "email", "label": "Email", "answer": "john@example.com"}
    ]'''

    result = ai_service.fill_form([...], 'resume', {...})

    assert len(result) == 1
    assert result[0]['answer'] == 'john@example.com'
```

---

## What to Test (Backend)

### Unit Tests (Services)

```python
# tests/services/test_ai_service.py
def test_load_prompt_reads_file():
    """Prompt loader reads and returns file contents."""
    content = ai_service.load_prompt('tailor_resume.txt')
    assert len(content) > 0

def test_parse_form_response_extracts_json():
    """Form response parser extracts JSON from LLM response."""
    response = '[\n{"field_id": "email", "answer": "test@example.com"}\n]'
    parsed = ai_service.parse_form_response(response)
    assert parsed[0]['field_id'] == 'email'

def test_parse_form_response_handles_invalid_json():
    """Form parser raises error on invalid JSON."""
    with pytest.raises(JSONDecodeError):
        ai_service.parse_form_response('not json')
```

### Integration Tests (Endpoints)

```python
# tests/routers/test_resume.py
def test_tailor_resume_end_to_end(mocker):
    """Test full resume tailoring workflow."""
    # Mock AI service
    mocker.patch('app.services.ai_service.completion', return_value=...)
    # Mock DB service
    mocker.patch('app.services.db_service.save_resume', return_value=...)

    # Call endpoint
    response = client.post('/tailor-resume', json=...)

    # Verify response and side effects
    assert response.status_code == 200
    assert 'pdf_url' in response.json()
```

### Error Handling Tests

```python
def test_missing_api_key_returns_400():
    """Endpoint returns 400 when X-API-Key header missing."""
    response = client.post('/tailor-resume', json={...})
    # Headers missing X-API-Key
    assert response.status_code == 400

def test_invalid_json_body_returns_422():
    """Endpoint returns 422 for invalid request body."""
    response = client.post('/tailor-resume', json={'invalid': 'schema'})
    assert response.status_code == 422

def test_ai_provider_error_returns_503():
    """Endpoint returns 503 when AI provider fails."""
    mocker.patch('app.services.ai_service.completion', side_effect=Exception("API down"))
    response = client.post('/tailor-resume', json={...})
    assert response.status_code == 503
```

---

## Common Test Patterns

### Testing API Responses

```python
def test_fill_form_response_schema():
    """Ensure response matches documented schema."""
    response = client.post('/fill-form', json={...})

    data = response.json()
    assert 'answers' in data
    assert 'qa_saved' in data
    assert isinstance(data['answers'], list)
    assert isinstance(data['qa_saved'], bool)

    # Validate answer structure
    if data['answers']:
        answer = data['answers'][0]
        assert 'field_id' in answer
        assert 'answer' in answer
        assert 'field_type' in answer
```

### Testing Error Messages

```python
def test_error_response_has_detail():
    """Error responses include user-facing detail message."""
    response = client.post('/log-job', json={})  # Missing required fields

    assert response.status_code == 422
    error = response.json()
    assert 'detail' in error
    assert len(error['detail']) > 0
```

### Testing with Headers

```python
def test_endpoint_with_api_key():
    """Endpoint accepts X-API-Key header."""
    headers = {'X-API-Key': 'sk-test-key'}
    response = client.post('/tailor-resume', json={...}, headers=headers)

    assert response.status_code == 200
```

---

## Fixtures

### pytest Fixtures (conftest.py)

```python
# tests/conftest.py
import pytest
from fastapi.testclient import TestClient
from app.main import app

@pytest.fixture
def client():
    """Provide FastAPI test client."""
    return TestClient(app)

@pytest.fixture
def mock_user_id(mocker):
    """Mock user ID extraction from request."""
    return mocker.patch('app.utils.get_user_id', return_value='user-123')

@pytest.fixture
def mock_ai_service(mocker):
    """Mock AI service for all tests."""
    return mocker.patch('app.services.ai_service')

@pytest.fixture
def mock_db_service(mocker):
    """Mock database service for all tests."""
    return mocker.patch('app.services.db_service')

@pytest.fixture
def sample_job_data():
    """Provide sample job data."""
    return {
        'company': 'Acme Corp',
        'title': 'Senior Engineer',
        'url': 'https://acme.example.com/jobs/123',
        'job_description': 'We are looking for...'
    }
```

---

## Coverage Goals

### Backend Coverage Targets

```
Services:          90%+ (unit tests)
Routers/Endpoints: 80%+ (integration tests)
Utilities:         95%+ (deterministic code)
Overall:           85%+ (target, enforced in CI)
```

**Enforced in CI (pytest.ini):**
```ini
[pytest]
addopts = --cov=app --cov-fail-under=85 --cov-report=html
testpaths = tests
asyncio_mode = auto
```

---

## Test Execution in CI/CD

### Frontend (GitHub Actions)

```yaml
# .github/workflows/test-extension.yml
- name: Run extension tests
  run: |
    cd extension
    npm ci
    npm run test:coverage
    # Coverage report uploaded for review
```

### Backend (GitHub Actions)

```yaml
# .github/workflows/test-backend.yml
- name: Run backend tests
  run: |
    cd backend
    pip install -r requirements.txt
    pytest --cov=app --cov-report=html
    # Fail if coverage < 85%
```

---

## Debugging Tests

### Frontend Debugging

```typescript
// Print debug info in test
import { render, screen, debug } from '@testing-library/react';

it('shows job detail', () => {
  render(<JobDetail />);
  debug();  // Prints entire DOM

  const element = screen.getByText('Acme');
  console.log(element);  // Log specific element
});

// Run single test file
npm test -- TrackerTable.test.tsx

// Run with verbose output
npm test -- --reporter=verbose
```

### Backend Debugging

```python
# Print debug info in test
def test_fill_form():
    response = client.post('/fill-form', json={...})
    print(response.json())  # Print response

# Run single test
pytest tests/routers/test_resume.py::test_tailor_resume_success

# Show print output
pytest -s tests/routers/test_resume.py

# Drop into debugger on failure
pytest --pdb tests/routers/test_resume.py
```

---

## Best Practices

**What to test:**
1. Happy path — main workflow works end-to-end
2. Error cases — invalid input, API failures, network errors
3. Edge cases — empty data, boundary values, special characters
4. User interactions — clicks, form submissions, navigation

**What NOT to test:**
1. Third-party libraries (trust they work)
2. Implementation details (test behavior, not code)
3. Cosmetic styling
4. External APIs (mock them)

**Test naming:**
- `test_[unit]_[scenario]_[expectation]`
- Examples: `test_fill_form_handles_empty_fields`, `test_save_qa_missing_job_id`

**Assertion style:**
- One main assertion per test (multiple OK if testing same scenario)
- Use descriptive assertion messages
- Arrange-Act-Assert pattern

---

*Testing analysis: 2026-03-04*
