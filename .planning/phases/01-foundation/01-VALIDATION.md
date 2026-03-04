---
phase: 1
slug: foundation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-04
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest 8.x + httpx (async test client for FastAPI) |
| **Config file** | `backend/pytest.ini` — Wave 0 installs |
| **Quick run command** | `cd backend && pytest tests/ -x -q` |
| **Full suite command** | `cd backend && pytest tests/ -v` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd backend && pytest tests/ -x -q`
- **After every plan wave:** Run `cd backend && pytest tests/ -v`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 01-01-01 | 01 | 1 | SETUP-01 | smoke | `pytest tests/test_health.py -x` | ❌ W0 | ⬜ pending |
| 01-01-02 | 01 | 1 | SETUP-01 | smoke | `pytest tests/test_cors.py -x` | ❌ W0 | ⬜ pending |
| 01-01-03 | 01 | 1 | SETUP-01 | smoke | `pytest tests/test_stubs.py -x` | ❌ W0 | ⬜ pending |
| 01-02-01 | 02 | 1 | SETUP-02 | manual | Supabase Dashboard check | N/A | ⬜ pending |
| 01-02-02 | 02 | 1 | SETUP-02 | manual | Supabase Dashboard RLS check | N/A | ⬜ pending |
| 01-03-01 | 03 | 1 | SETUP-03 | manual | Chrome DevTools check | N/A | ⬜ pending |
| 01-03-02 | 03 | 1 | SETUP-03 | manual | Visual inspection | N/A | ⬜ pending |
| 01-04-01 | 01 | 1 | SETUP-04 | integration | `curl http://localhost:8000/health` | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `backend/pytest.ini` — pytest config
- [ ] `backend/tests/__init__.py` — test package init
- [ ] `backend/tests/test_health.py` — covers SETUP-01 health check
- [ ] `backend/tests/test_cors.py` — covers SETUP-01 CORS for chrome-extension origins
- [ ] `backend/tests/test_stubs.py` — covers SETUP-01 all 7 router stubs return 501
- [ ] Framework install: `pytest pytest-asyncio httpx` in dev requirements

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| 5 DB tables exist in Supabase | SETUP-02 | External hosted DB — no programmatic access in test env | Open Supabase Dashboard → Table Editor → verify users, jobs, form_qa_pairs, resumes, chat_messages exist |
| RLS enabled on all 5 tables | SETUP-02 | Requires Supabase Dashboard inspection | Open Supabase → Auth → Policies → verify RLS badge on each table |
| Extension loads in Chrome | SETUP-03 | Browser-based UI test | Load unpacked from extension/build/chrome-mv3-dev → verify no console errors |
| 4-tab side panel renders | SETUP-03 | Visual UI verification | Open side panel → verify Fill Form, Resume, Tracker, Chat tabs render |
| Hot reload works | SETUP-04 | Requires live dev server observation | Edit a component → verify change appears without manual rebuild |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
