# Features Research

**Project:** JobPilot
**Researched:** 2026-03-04
**Confidence:** MEDIUM (competitive analysis based on training knowledge through 2025)

---

## Competitive Landscape

| Tool | Type | Key Feature | Pricing |
|------|------|------------|---------|
| Simplify | Chrome ext | One-click autofill on 100+ job sites | Freemium ($9/mo) |
| Teal | Web app + ext | Job tracker + resume builder + AI | Freemium ($29/mo) |
| Huntr | Web app + ext | Job tracker + board management | Freemium ($30/mo) |
| LazyApply | Chrome ext | Auto-submit applications | Paid ($24/mo) |
| Careerflow | Chrome ext | Job tracker + AI review | Freemium |
| JobPilot | Chrome ext | Open source, BYOK, full Q&A recall | Free (MIT) |

---

## Table Stakes (Must Have or Users Leave)

These are features users expect from any job application tool. Missing any of these creates friction that drives users to alternatives.

### Resume Features

| Feature | Complexity | Dependencies | Notes |
|---------|-----------|-------------|-------|
| Base resume upload (PDF) | Low | pdfplumber | Parse PDF → plain text on upload |
| AI resume tailoring to JD | Medium | LiteLLM, prompt template | Core feature — reorder skills, mirror keywords |
| Resume preview before download | Low | None (plain text display) | Side panel rendering |
| PDF download of tailored resume | Medium | WeasyPrint | HTML → PDF with clean formatting |

### Application Form Features

| Feature | Complexity | Dependencies | Notes |
|---------|-----------|-------------|-------|
| Form field detection on page | High | Content script DOM traversal | Must handle diverse site structures |
| AI-generated answers per field | Medium | LiteLLM, user profile, resume | JSON-only response format |
| Copy-paste answer interface | Low | Side panel UI | V1 approach — display answers for manual paste |
| Q&A auto-save to database | Medium | Backend DB service | Upsert by (job_id, field_id) |

### Tracking Features

| Feature | Complexity | Dependencies | Notes |
|---------|-----------|-------------|-------|
| Job list/table view | Medium | Backend GET /jobs endpoint | Sortable, filterable spreadsheet |
| Job status management | Low | Inline dropdown in tracker | saved → applied → interview → offer/rejected |
| Auto-log job on first interaction | Low | POST /log-job on resume tailor or form fill | Company + title extracted from JD |
| Notes per job | Low | Editable text field | Free-form user notes |

### Settings/Config

| Feature | Complexity | Dependencies | Notes |
|---------|-----------|-------------|-------|
| API key configuration | Low | chrome.storage.local | Provider + key + model name |
| Backend URL configuration | Low | chrome.storage.local | Default localhost:8000 |
| Database connection setup | Low | chrome.storage.local | Supabase URL + anon key |
| User profile fields | Low | chrome.storage.local | Name, email, LinkedIn, work auth |

---

## Differentiators (Competitive Advantage)

These features set JobPilot apart from existing tools. They should be prioritized for V1.

### Full Application Recall (Core Differentiator)

| Feature | Complexity | Dependencies | Notes |
|---------|-----------|-------------|-------|
| Job Detail View per application | Medium | GET /job/:id aggregation | Single source of truth for each application |
| Full Q&A history per job | Medium | form_qa_pairs table + QAPanel | Every question + answer saved and reviewable |
| Inline Q&A editing | Low | POST /save-qa with edited_by_user flag | User corrects what they actually submitted |
| JD text stored per job | Low | jobs.job_description column | Review the exact JD later |
| Tailored resume linked to job | Low | resumes table with job_id FK | See what resume was submitted |

**Why this matters:** No competitor stores the actual form Q&A pairs. Users currently have no way to review what they wrote on Greenhouse/Lever forms after submission. This is JobPilot's primary differentiator.

### Open Source + BYOK Model

| Feature | Complexity | Dependencies | Notes |
|---------|-----------|-------------|-------|
| Bring-your-own AI key | Low | X-API-Key header per request | No vendor lock-in |
| User-owned database | Low | User provides Supabase credentials | Data sovereignty |
| Ollama support (local AI) | Low | LiteLLM handles routing | Free, private AI option |
| Self-hostable backend | Medium | Docker Compose | One-command setup |

### AI Career Coach

| Feature | Complexity | Dependencies | Notes |
|---------|-----------|-------------|-------|
| Chat with full job context | Medium | POST /chat with JD + resume + Q&A context | Interview prep grounded in application data |
| Persistent chat history per job | Low | chat_messages table | Review coaching advice later |

---

## Anti-Features (Deliberately NOT Building)

| Feature | Why NOT | Risk if Built |
|---------|---------|--------------|
| Auto-submit applications | Ethical concerns, ToS violations on job sites, quality over quantity | Account bans, spam applications |
| Autofill (DOM injection) V1 | Brittle across sites, high maintenance, user can't review | Broken on half the sites, wrong data submitted |
| Site-specific adapters V1 | Massive maintenance surface (Greenhouse, Lever, Workday all different) | Never-ending adapter development |
| Built-in AI model | Dramatically increases complexity, hosting cost | Users already have API keys or can use Ollama |
| Social/team features | Out of scope for individual job seeker tool | Feature creep, auth complexity |
| Email automation | Spam risk, low value vs complexity | Reputation damage |
| Analytics/telemetry | Contradicts privacy-first design | User distrust |
| Mobile app | Web extension is the right surface for job applications | Divided development effort |

---

## Feature Dependencies

```
User Profile (Options Page)
    └── Required by: Resume Tailoring, Form Fill, Chat

Base Resume Upload
    └── Required by: Resume Tailoring, Form Fill

Content Script (JD Detection)
    └── Required by: Resume Tailoring, Auto Job Logging

Content Script (Form Detection)
    └── Required by: Form Fill

Backend API (all endpoints)
    └── Required by: All AI features, all DB features

DB Schema
    └── Required by: Job Tracker, Job Detail View, Q&A Save, Chat History

Resume Tailoring
    └── Enables: PDF Download, Job Detail View (resume section)

Form Fill + Q&A Save
    └── Enables: Job Detail View (Q&A section), Chat Context

Job Tracker
    └── Enables: Job Detail View (navigation)

Job Detail View
    └── Depends on: All above features populated
```

---

## V2 Features (Deferred)

| Feature | Why Deferred | Complexity |
|---------|-------------|-----------|
| One-click autofill | Requires site-specific DOM manipulation | High |
| Site adapters (Greenhouse, Lever, Workday) | Each site is unique, ongoing maintenance | High per site |
| Application analytics | Nice-to-have, not core value | Medium |
| AI interview coaching with Q&A reference | Build on V1 chat, more specialized prompts | Medium |
| Firefox extension | Plasmo supports it, but testing/QA doubles | Medium |
| Bulk status updates | Convenience feature | Low |

---

## Sources

- docs/PRD.md — Feature specifications and user flows (HIGH confidence)
- docs/SRS.md — Technical implementation details (HIGH confidence)
- Training knowledge — Competitor analysis through 2025 (MEDIUM confidence)

---

*Features research: 2026-03-04*
