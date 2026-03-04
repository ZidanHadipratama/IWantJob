---
phase: quick
plan: 1
subsystem: project-config
tags: [rename, git-config, branding]
dependency_graph:
  requires: []
  provides: [iwantjob-branding, github-remote]
  affects: [CLAUDE.md, PROJECT.md, package.json, main.py, test_health.py]
tech_stack:
  added: []
  patterns: []
key_files:
  created: []
  modified:
    - /home/ikktaa/app/JobPilot/CLAUDE.md
    - /home/ikktaa/app/JobPilot/.planning/PROJECT.md
    - /home/ikktaa/app/JobPilot/extension/package.json
    - /home/ikktaa/app/JobPilot/backend/app/main.py
    - /home/ikktaa/app/JobPilot/backend/tests/test_health.py
decisions: []
metrics:
  duration: 54s
  completed: "2026-03-04T16:53:31Z"
---

# Quick Task 1: Rename App to IWantJob and Set GitHub Remote

Renamed all user-facing and code-identifier references from JobPilot/jobpilot to IWantJob/iwantjob, and configured git remote origin to point to ZidanHadipratama/IWantJob.

## Tasks Completed

### Task 1: Rename app references (5 files)

| File | Change |
|------|--------|
| `CLAUDE.md` | `**JobPilot**` -> `**IWantJob**` in project description |
| `.planning/PROJECT.md` | Heading `# JobPilot` -> `# IWantJob`, description updated |
| `extension/package.json` | `name: jobpilot-extension` -> `iwantjob-extension`, `displayName: JobPilot` -> `IWantJob` |
| `backend/app/main.py` | FastAPI title `JobPilot API` -> `IWantJob API`, health service `jobpilot-backend` -> `iwantjob-backend` |
| `backend/tests/test_health.py` | Assertion updated to expect `iwantjob-backend` |

**Commit:** `9883d7a`

### Task 2: Set git remote origin

Configured git remote origin to `git@github.com:ZidanHadipratama/IWantJob.git`. No prior remote existed, so `git remote add` was used directly.

**Commit:** None (git config only, no file changes)

## Deviations from Plan

None - plan executed exactly as written.

## Verification

- All 5 files contain "IWantJob" or "iwantjob" as appropriate
- Zero remaining "JobPilot" or "jobpilot" references in modified files
- `git remote -v` shows origin pointing to `git@github.com:ZidanHadipratama/IWantJob.git`
