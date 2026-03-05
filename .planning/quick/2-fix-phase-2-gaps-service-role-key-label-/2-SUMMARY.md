---
phase: quick
plan: 2
subsystem: extension-options, backend-resume
tags: [marker-pdf, pdf-extraction, options-page, service-role-key, gap-closure]
dependency_graph:
  requires: [02-data-plumbing/02-02, 02-data-plumbing/02-03]
  provides: [correct-supabase-key-label, marker-pdf-extraction]
  affects: [options-page-ux, pdf-upload-pipeline]
tech_stack:
  added: [marker-pdf>=1.0.0]
  removed: [pdfplumber>=0.11.0]
  patterns: [tempfile-for-marker-api, torch-cpu-preinstall]
key_files:
  modified:
    - extension/src/components/options/SupabaseConfigCard.tsx
    - backend/requirements.txt
    - backend/Dockerfile
    - backend/app/routers/resume.py
    - backend/tests/test_upload_resume.py
decisions:
  - "marker-pdf needs file path not BytesIO, use tempfile.NamedTemporaryFile with finally cleanup"
  - "torch CPU installed before requirements.txt in Dockerfile to avoid CUDA torch pull"
  - "Internal field name supabase_key unchanged — only user-facing label changes to avoid cascading updates"
metrics:
  duration: "~8min"
  completed: "2026-03-05"
  tasks_completed: 2
  tasks_total: 2
---

# Quick Task 2: Fix Phase 2 Gaps — Service Role Key Label and marker-pdf Extraction

**One-liner:** Relabeled Supabase key to Service Role Key with helper text, replaced pdfplumber with marker-pdf for image/scanned PDF support.

## What Was Built

### Task 1: Service Role Key Label (commit 594ea65)

Updated `SupabaseConfigCard.tsx` to relabel the Supabase key input from "Anon Key" to "Service Role Key" with helper text guiding users to find it in the Supabase Dashboard.

Changes:
- Comment updated from `{/* Anon key */}` to `{/* Service Role Key */}`
- Label text changed from "Supabase Anon Key" to "Supabase Service Role Key"
- Helper paragraph added below label with Supabase Dashboard navigation path
- aria-labels on show/hide button updated to reference "service role key"
- Internal `supabase_key` field name unchanged in DBConfig/storage.ts/api.ts

### Task 2: marker-pdf PDF Extraction (commit a206a45)

Replaced pdfplumber with marker-pdf in the `/upload-resume` endpoint to support image-based and scanned PDFs via OCR.

Changes:
- `requirements.txt`: removed `pdfplumber>=0.11.0`, added `marker-pdf>=1.0.0`
- `Dockerfile`: added `pip install torch --index-url https://download.pytorch.org/whl/cpu` before requirements install to force CPU-only torch
- `resume.py`: removed `io`/`pdfplumber` imports; added `tempfile`, `os`, `PdfConverter`, `create_model_dict`; rewrote extraction block to use tempfile + marker pipeline; updated docstring
- `test_upload_resume.py`: removed pdfplumber mock helpers; added marker-pdf mock helpers using `MagicMock`; updated tests 1 and 3 to patch `PdfConverter` and `create_model_dict`

## Test Results

All 37 backend tests pass (up from 14 directly tested, full suite confirmed):
- 5/5 upload-resume tests pass
- 9/9 endpoint tests pass
- TypeScript compiles clean

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check

- [x] `extension/src/components/options/SupabaseConfigCard.tsx` — modified
- [x] `backend/requirements.txt` — marker-pdf added, pdfplumber removed
- [x] `backend/Dockerfile` — torch CPU pre-install added
- [x] `backend/app/routers/resume.py` — marker-pdf extraction implemented
- [x] `backend/tests/test_upload_resume.py` — mocks updated
- [x] Commit 594ea65 — Task 1 commit
- [x] Commit a206a45 — Task 2 commit
- [x] No pdfplumber references remain in backend/
- [x] "Service Role Key" appears in SupabaseConfigCard.tsx

## Self-Check: PASSED
