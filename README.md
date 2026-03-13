<p>
  <img src="extension/assets/icon.png" alt="IWantJob logo" width="56" height="56">
</p>

# IWantJob

IWantJob is an open-source Chrome extension plus FastAPI backend for AI-assisted job applications.

It is built for a review-first workflow:
- extract the job description from the current tab
- tailor a resume to the role
- generate draft form answers
- autofill supported fields in the browser
- save only the reviewed application into a tracker and detail workspace

The product is intentionally draft-first. AI output is editable before it touches the tracker, so the saved record reflects the application you approved, not the model's first pass.

## Why It Exists

Most AI job-application tools stop at a demo:
- they tailor a resume once
- generate a few answers
- and ignore the messy reality of review, recovery, autofill limits, and tracking

IWantJob is designed around those edges. It keeps the useful AI steps, but adds the workflow around them:
- local draft review before save
- field-level autofill reporting
- iframe and custom-form handling
- a real tracker and job detail workspace

## Product Surface

### Core flow

`Resume` -> `Fill Form` -> `Save to Tracker`

1. Extract the job description from the current tab.
2. Tailor your resume against that role.
3. Generate draft answers for the application form.
4. Review and edit everything locally.
5. Autofill supported controls if it helps.
6. Save the approved application into the tracker.

### What it does

- Extracts job descriptions from the current tab
- Tailors a resume against a specific role
- Generates draft Q&A for application forms
- Autofills supported text, select, radio, checkbox, file, custom combobox, and iframe-hosted form flows
- Keeps AI output editable before save
- Uses optional persona context to improve answer framing
- Saves approved applications into a Supabase-backed tracker
- Opens saved applications in a detail workspace with notes, resume, Q&A, and structured JD data

## Screenshots

These screenshots were captured from the current UI with Playwright.

<table>
  <tr>
    <td valign="top">
      <img src="assets/readme/sidepanel-resume-draft.png" alt="Resume tailoring sidepanel with an unsaved tailored resume draft" width="320">
      <p><strong>Resume draft in the sidepanel</strong><br>Review the extracted role, edit the tailored resume inline, then continue into Fill Form for the final review-and-save flow.</p>
    </td>
    <td valign="top">
      <img src="assets/readme/sidepanel-fill-form-draft.png" alt="Fill Form sidepanel with editable generated answers" width="320">
      <p><strong>Editable Fill Form answers</strong><br>Generated answers stay local and editable so the user can clean them up, autofill supported fields, and save to Supabase only when the application draft is approved.</p>
    </td>
  </tr>
</table>

<p>
  <img src="assets/readme/tracker-job-detail.png" alt="Tracker detail workspace showing saved metadata, job description, tailored resume, and saved Q and A" width="100%">
</p>
<p><strong>Tracker detail workspace</strong><br>Once saved, each application opens in a richer workspace for status updates, notes, saved Q&amp;A, and resume review.</p>

## Product Areas

### Sidepanel

- `Resume` — extract the JD, generate a tailored resume, edit it inline, then hand off to Fill Form for final review
- `Fill Form` — extract fields, generate draft answers, use optional persona context, autofill supported controls, and act as the final explicit save surface
- `Tracker` — open the saved application tracker workflow

### Options Page

- Job tracker with search, filtering, sorting, editing, and delete
- Full job detail workspace for JD, tailored resume, Q&A, notes, and status
- Settings for backend URL, AI configuration, Supabase configuration, base resume, and optional persona text

### Backend

- FastAPI API for tailoring, form generation, PDF generation, and CRUD
- LiteLLM-based AI provider abstraction
- Supabase-backed persistence for jobs, resumes, and Q&A

IWantJob uses a Bring-Your-Own stack:

- your AI provider key
- your Supabase project
- your local backend process

## Architecture

The project has 3 main pieces:

- `extension/`
  Plasmo-based Chrome extension with content scripts, sidepanel UI, and options page

- `backend/`
  FastAPI service for AI calls, PDF generation, and Supabase-backed persistence

- `supabase/`
  SQL migrations for the user-owned database schema

## Repository Layout

```text
IWantJob/
├── extension/   # Chrome extension (Plasmo + React + TypeScript)
├── backend/     # FastAPI backend
├── supabase/    # DB migrations
└── assets/      # Public README images and demo assets
```

## Run Locally

### 1. Install dependencies

Repo root:

```bash
npm install
```

Extension:

```bash
cd extension
npm install
```

Backend:

```bash
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

### 2. Start the backend

Choose one supported backend path.

### Option A: Docker

```bash
docker compose up --build -d backend
```

Stop it later with:

```bash
docker compose down
```

### Option B: Local Python

```bash
.venv/bin/python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

Both paths expose the backend at:

```text
http://localhost:8000
```

Health check:

```bash
curl http://127.0.0.1:8000/health
```

### 3. Prepare Supabase

You need your own Supabase project.

- Create a project in Supabase
- Apply the SQL migrations in `supabase/migrations/`
- Collect:
  - project URL
  - anon/service key used by this local workflow

If you use the Supabase CLI from the repo root:

```bash
supabase db push
```

### 4. Build the extension

```bash
npm run build
```

### 5. Load the extension in Chrome

In Chrome:

1. Open `chrome://extensions`
2. Enable `Developer mode`
3. Click `Load unpacked`
4. Select `extension/build/chrome-mv3-prod`

### 6. Configure the extension

Open the extension options page and provide:

- Backend URL
  - usually `http://localhost:8000`
- Supabase URL
- Supabase key
- Base resume
- AI provider/model/key
- Persona text (optional)

The product currently expects a Bring-Your-Own setup:

- your backend process
- your Supabase project
- your AI credentials

## License

This repository is licensed under the GNU Affero General Public License v3.0.
See [LICENSE](./LICENSE).

That means:

- You can self-host, modify, and redistribute this code
- If you run a modified version for users over a network, you must offer the corresponding source code for that modified version
- The repository license does not grant rights to the `IWantJob` name, logo, or product branding

See [TRADEMARKS.md](./TRADEMARKS.md) for the branding policy.

The paid hosted service can still include separate infrastructure, secrets,
model/provider accounts, prompts, deployment automation, and operational
services that are not part of this repository.

### 6. Run Playwright smoke tests

From `extension/`:

```bash
npx playwright install chromium
PLAYWRIGHT_SKIP_EXTENSION_BUILD=1 npx playwright test tests/smoke.spec.ts
```

This is the safest first-run path in this repo. It uses the existing build instead of forcing a rebuild inside the Playwright command.

If you want a visible browser window:

```bash
PLAYWRIGHT_SKIP_EXTENSION_BUILD=1 npx playwright test tests/smoke.spec.ts --headed
```

On WSL, headed mode requires GUI support such as WSLg or an X server with `DISPLAY` configured. If Linux browser dependencies are missing, run:

```bash
npx playwright install --with-deps chromium
```

## How To Use

### Initial bootstrap

1. Start the backend
2. Load the unpacked extension
3. Open the options page
4. Configure backend URL, Supabase, AI model, and base resume

### Normal application workflow

1. Open a job description page
2. Open the extension sidepanel
3. In `Resume`, click `Get Job Description`
4. Review the extracted JD and click `Tailor Resume`
5. Edit the tailored resume locally if needed
6. Switch to `Fill Form`
7. Click `Get Form Fields`
8. Generate draft answers and edit them locally
9. Use `Autofill Form` for supported controls if helpful
10. Click `Save to Tracker` from `Fill Form`

Important:

- tailoring does not save automatically
- form generation does not save automatically
- autofill does not save automatically
- the tracker is meant to contain reviewed application records only

### After saving

Once a draft is saved:

- the tracker row appears in the options page
- the detail workspace can show:
  - job description
  - tailored resume
  - saved Q&A
  - notes
  - status

## Troubleshooting

### The sidepanel cannot reach the backend

Check:

- the backend process is running
- the backend URL in extension settings is correct
- the backend is reachable at `http://localhost:8000/health`

### Tailor Resume or Fill Form does nothing useful

Check:

- an AI provider/model/key is configured
- a base resume is saved in settings
- persona is optional, so missing persona is not a blocker
- the page actually contains a readable JD or form

### Autofill only partially works

This is expected on some job sites.

Check:

- some fields are intentionally left for manual review
- composite phone fields and custom upload widgets may require manual input
- large choice sets may be skipped unless you explicitly include selected flagged fields
- embedded forms inside iframes are supported, but some hosts still use custom widgets the browser cannot safely control

### The tracker still shows nothing

Check:

- you clicked `Save to Tracker`
- Supabase URL/key are configured
- the backend can talk to Supabase

### Chrome is still showing old UI code

Rebuild and reload the extension:

```bash
cd extension
npm run build
```

Then reload the unpacked extension in `chrome://extensions`.

### The product feels stuck between draft and saved state

This is usually a workflow issue, not a model issue:

- `Resume` and `Fill Form` create local drafts first
- only `Save to Tracker` writes the reviewed application to Supabase
- after new edits, a saved application can re-enter unsaved draft state until you save again

## Notes

- This is not a hosted SaaS product. You are expected to run the backend and provide your own credentials.
- The backend has a verified Docker path, but the Chrome extension still runs as a normal unpacked extension in your local browser.
- The current build flow uses `npm run build` for the extension.
