---
phase: quick
plan: 1
type: execute
wave: 1
depends_on: []
files_modified:
  - /home/ikktaa/app/JobPilot/CLAUDE.md
  - /home/ikktaa/app/JobPilot/.planning/PROJECT.md
  - /home/ikktaa/app/JobPilot/extension/package.json
  - /home/ikktaa/app/JobPilot/backend/app/main.py
  - /home/ikktaa/app/JobPilot/backend/tests/test_health.py
autonomous: true
requirements: []
user_setup: []

must_haves:
  truths:
    - "All references to 'JobPilot' renamed to 'IWantJob' in user-facing text and code"
    - "All references to 'jobpilot' renamed to 'iwantjob' in package names and identifiers"
    - "Git remote origin set to git@github.com:ZidanHadipratama/IWantJob.git"
  artifacts:
    - path: /home/ikktaa/app/JobPilot/CLAUDE.md
      provides: "Project overview with app name, visible to developers"
      contains: "IWantJob"
    - path: /home/ikktaa/app/JobPilot/.planning/PROJECT.md
      provides: "Planning document header with app name"
      contains: "IWantJob"
    - path: /home/ikktaa/app/JobPilot/extension/package.json
      provides: "Extension metadata"
      contains: '"displayName": "IWantJob"'
    - path: /home/ikktaa/app/JobPilot/backend/app/main.py
      provides: "FastAPI title in API docs"
      contains: '"IWantJob API"'
  key_links:
    - from: "Git configuration"
      to: "GitHub repository"
      via: "origin remote"
      pattern: "git@github.com:ZidanHadipratama/IWantJob.git"
---

<objective>
Rename the application from "JobPilot" to "IWantJob" consistently across all files, and configure git remote to point to the correct GitHub repository.

Purpose: Brand identity alignment and correct repository configuration
Output: Renamed files committed, git remote configured
</objective>

<execution_context>
@/home/ikktaa/app/JobPilot/CLAUDE.md
@/home/ikktaa/app/JobPilot/.planning/PROJECT.md
</execution_context>

<context>
Project is currently named "JobPilot" throughout docs, code configs, and planning files. User decision to rename to "IWantJob" and set GitHub remote.

Files that reference "JobPilot" or "jobpilot":
- CLAUDE.md — lines 9, 18 (heading + description)
- .planning/PROJECT.md — line 1 (heading + description in lines 4-5)
- extension/package.json — name field and displayName field
- backend/app/main.py — FastAPI title and health check service name
- backend/tests/test_health.py — assertion on service name
</context>

<tasks>

<task type="auto">
  <name>Task 1: Rename app references in CLAUDE.md, PROJECT.md, and package configs</name>
  <files>/home/ikktaa/app/JobPilot/CLAUDE.md, /home/ikktaa/app/JobPilot/.planning/PROJECT.md, /home/ikktaa/app/JobPilot/extension/package.json, /home/ikktaa/app/JobPilot/backend/app/main.py, /home/ikktaa/app/JobPilot/backend/tests/test_health.py</files>
  <action>
1. Open /home/ikktaa/app/JobPilot/CLAUDE.md, replace line 9 "**JobPilot**" with "**IWantJob**" and line 18 "No SaaS..." to reference the renamed app
2. Open /home/ikktaa/app/JobPilot/.planning/PROJECT.md, replace line 1 "# JobPilot" with "# IWantJob" and update descriptions to reference IWantJob instead of JobPilot
3. Open /home/ikktaa/app/JobPilot/extension/package.json:
   - Change line 2 "name": "jobpilot-extension" to "name": "iwantjob-extension"
   - Change line 3 "displayName": "JobPilot" to "displayName": "IWantJob"
4. Open /home/ikktaa/app/JobPilot/backend/app/main.py:
   - Change FastAPI title from "JobPilot API" to "IWantJob API"
   - Change service name in health check from "jobpilot-backend" to "iwantjob-backend"
5. Open /home/ikktaa/app/JobPilot/backend/tests/test_health.py:
   - Update assertion to expect "iwantjob-backend" instead of "jobpilot-backend"

Use sed or direct file edits to make these replacements.
  </action>
  <verify>
    <automated>grep -l "IWantJob" /home/ikktaa/app/JobPilot/CLAUDE.md /home/ikktaa/app/JobPilot/.planning/PROJECT.md && grep '"displayName": "IWantJob"' /home/ikktaa/app/JobPilot/extension/package.json && grep "IWantJob API" /home/ikktaa/app/JobPilot/backend/app/main.py && grep "iwantjob-backend" /home/ikktaa/app/JobPilot/backend/tests/test_health.py</automated>
  </verify>
  <done>
All files contain "IWantJob" or "iwantjob" as appropriate for user-facing text (IWantJob) and code identifiers (iwantjob). No "JobPilot" or "jobpilot" references remain in these key files.
  </done>
</task>

<task type="auto">
  <name>Task 2: Set git remote origin to GitHub repository</name>
  <files>None (git configuration only)</files>
  <action>
Run the following command to set the git remote origin:

git remote add origin git@github.com:ZidanHadipratama/IWantJob.git

If the remote already exists (git remote -v shows origin), first remove it:
git remote remove origin

Then add the new one.
  </action>
  <verify>
    <automated>git remote -v | grep "origin.*ZidanHadipratama/IWantJob"</automated>
  </verify>
  <done>
Git remote origin is configured and pointing to git@github.com:ZidanHadipratama/IWantJob.git. Verification shows output from "git remote -v" containing the correct URL.
  </done>
</task>

</tasks>

<verification>
After completion:
1. Confirm no remaining "JobPilot" (user-facing) or "jobpilot" (identifiers) in renamed files using grep
2. Confirm git remote is set correctly with "git remote -v"
3. Run backend tests to confirm health check assertion passes with new service name
</verification>

<success_criteria>
- CLAUDE.md header and description reference "IWantJob"
- PROJECT.md header and descriptions reference "IWantJob"
- extension/package.json shows "iwantjob-extension" and "IWantJob" displayName
- backend/app/main.py shows "IWantJob API" and "iwantjob-backend"
- backend tests pass with "iwantjob-backend" assertion
- git remote origin configured to git@github.com:ZidanHadipratama/IWantJob.git
- All changes committed to git
</success_criteria>

<output>
After completion, create `.planning/quick/1-rename-app-to-iwantjob-and-set-github-re/1-SUMMARY.md` documenting files renamed, git remote configured, and any related config updates.
</output>
