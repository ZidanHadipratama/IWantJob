# Pitfalls Research

**Project:** JobPilot
**Researched:** 2026-03-04
**Confidence:** HIGH (Chrome extension + AI backend pitfalls well-documented)

---

## Critical Pitfalls (Must Address in V1)

### 1. MV3 Service Worker Lifetime

**What goes wrong:** MV3 service workers are terminated after ~30 seconds of inactivity. Any in-memory state, timers, or pending operations are lost. Code that assumes a persistent background page will silently fail.

**Warning signs:** Offline Q&A retry logic stops working; pending_qa_pairs never synced; chrome.runtime.onMessage handlers unregistered after idle period.

**Prevention:**
- Store ALL state in chrome.storage (local or session), never in service worker variables
- Use chrome.alarms API for periodic tasks (like retrying pending Q&A pairs)
- Keep service worker stateless — reconstruct context from storage on each wake

**Phase:** Phase 1 (Extension scaffolding) — design for this from day one

---

### 2. Content Script Race Condition on SPAs

**What goes wrong:** Content scripts fire on page load, but modern job sites (Greenhouse, Lever, Workday) are SPAs that render content after initial load. JD text or form fields don't exist in DOM when content script runs.

**Warning signs:** "No job content detected" on pages that clearly have JD text; form fields empty array on pages with visible forms.

**Prevention:**
- Use MutationObserver to watch for DOM changes after initial load
- Implement retry with exponential backoff (check DOM at 500ms, 1s, 2s, 4s)
- Set a maximum wait time (10s) before showing "no content detected" + manual paste fallback
- Test on Greenhouse, Lever, Workday, LinkedIn, Indeed as representative sites

**Phase:** Phase 4 (Content script)

---

### 3. AI Prompt Non-JSON Output

**What goes wrong:** LLMs frequently ignore "return only JSON" instructions — they add preamble ("Here are the answers:"), markdown fences (```json), or trailing explanation. The fill-form endpoint parser breaks.

**Warning signs:** JSON.parse errors in form fill responses; answers array is undefined; AI returns markdown instead of raw JSON.

**Prevention:**
- Use `response_format={"type": "json_object"}` in litellm.completion() call (supported by OpenAI, Anthropic)
- Add JSON extraction fallback: regex to find `[...]` or `{...}` in response if raw parse fails
- Validate response shape with Pydantic before returning to extension
- Test with each supported provider (GPT-4o, Claude, Gemini, Ollama/Llama) — behavior differs

**Phase:** Phase 3 (AI core)

---

### 4. chrome.storage.local 10MB Quota

**What goes wrong:** `chrome.storage.local` has a 10MB total quota. If pending_qa_pairs buffer grows (e.g., backend is down for extended period), or user's base resume is very large, quota is silently exceeded and writes fail.

**Warning signs:** chrome.runtime.lastError after storage.set(); settings not persisting; API key appears to "forget" itself.

**Prevention:**
- Monitor storage usage: `chrome.storage.local.getBytesInUse()`
- Cap pending_qa_pairs buffer at 100 entries — oldest entries dropped with warning
- Store base resume as plain text (not PDF binary) — keep under 100KB
- Show user warning toast when storage exceeds 80% capacity

**Phase:** Phase 6 (Resilience)

---

### 5. Supabase Row Level Security (RLS) Disabled by Default

**What goes wrong:** Supabase creates tables with RLS disabled. Without explicit policies, any authenticated request can read/write ALL rows in ALL tables — complete data exposure in multi-user deployments.

**Warning signs:** User A can see User B's jobs; deleting a job deletes another user's data; no "permission denied" errors during testing (which means no security is applied).

**Prevention:**
- Enable RLS on EVERY table in migration files
- Create policies: `USING (user_id = auth.uid())` for SELECT/UPDATE/DELETE
- Create policies: `WITH CHECK (user_id = auth.uid())` for INSERT
- Backend db_service.py must ALWAYS include user_id in WHERE clauses as defense-in-depth
- Test with two different user sessions to verify isolation

**Phase:** Phase 1 (DB schema + migrations)

---

### 6. WeasyPrint CSS Subset Limitations

**What goes wrong:** WeasyPrint does NOT support CSS Grid, Flexbox, or many modern CSS features. Resume templates designed with modern CSS render incorrectly or not at all in generated PDFs.

**Warning signs:** PDF layout completely broken; elements overlapping; columns not aligning; blank pages generated.

**Prevention:**
- Use only CSS tables, floats, and absolute/relative positioning in resume templates
- Test PDF output with every template change — don't assume browser preview matches PDF
- Use simple, clean resume layouts (single column or two-column via CSS table)
- WeasyPrint docs list supported CSS properties — reference before using any property

**Phase:** Phase 3 (PDF generation)

---

### 7. LiteLLM Provider Behavioral Differences

**What goes wrong:** Prompts tuned for GPT-4o produce different (often worse) results with Claude, Gemini, or Ollama models. Token limits, response formats, system message handling, and instruction following vary significantly.

**Warning signs:** Resume tailoring works with GPT-4o but produces garbage with Ollama; form fill JSON parsing breaks only with Gemini; chat responses are too long or too short depending on provider.

**Prevention:**
- Test all prompts with at least: GPT-4o, Claude 3.5, and one Ollama model (Llama 3)
- Keep prompts simple and explicit — avoid provider-specific features
- Use temperature=0 or low temperature for form fill (consistency matters)
- Add model-specific token limit handling in ai_service.py (check litellm.model_cost for limits)

**Phase:** Phase 3 (AI core) — ongoing through all phases

---

## Moderate Pitfalls

### 8. Chrome Extension Message Passing Reliability

**What:** Messages between content script → background → side panel can be silently dropped if the receiving end isn't ready (side panel not yet opened, background worker just woke up).

**Prevention:** Use chrome.runtime.sendMessage with response callbacks; add retry logic; verify side panel is open before sending messages to it. Use @plasmohq/messaging for type-safe wrappers.

**Phase:** Phase 4

---

### 9. Form Field ID Instability

**What:** Job sites like Workday generate random GUIDs for field IDs that change on every page load. The `field_id` used for Q&A upsert becomes unreliable — same form, different IDs.

**Prevention:** Use a composite identifier: combine field label + field type + field position as fallback when DOM id looks like a GUID. Implement fuzzy matching for Q&A upsert.

**Phase:** Phase 4

---

### 10. Supabase Anon Key Exposure

**What:** If the extension ever imports @supabase/supabase-js and uses the anon key directly, that key is visible in the extension bundle. Combined with RLS-off tables, this is a complete data breach.

**Prevention:** Never import Supabase client in extension code. All DB access through backend API. The anon key in chrome.storage.local is only passed to the backend for server-side Supabase client initialization.

**Phase:** Phase 1 (Architecture decision — enforce throughout)

---

### 11. PDF Signed URL Expiry

**What:** Supabase Storage signed URLs expire after the configured TTL (24h for JobPilot). Users bookmarking PDF URLs or storing them get 403 errors after expiry.

**Prevention:** Never treat pdf_url as permanent. In Job Detail View, show "Download Resume" button that regenerates PDF on demand. Display "PDF link expired — click to regenerate" if fetch fails with 403.

**Phase:** Phase 5 (Job Detail View)

---

### 12. pdfplumber Failure on Complex PDFs

**What:** pdfplumber can't extract text from scanned PDFs (image-only), heavily formatted PDFs (tables, columns), or password-protected PDFs. Resume upload silently produces empty or garbled text.

**Prevention:** Validate extracted text length — if < 100 characters, warn user. Offer manual text paste as fallback. Consider adding OCR (pytesseract) as V2 enhancement for scanned PDFs.

**Phase:** Phase 2 (Options page / resume upload)

---

### 13. Extension Permissions Triggering User Distrust

**What:** Requesting broad permissions (e.g., `<all_urls>`, `tabs`, `storage`) causes Chrome Web Store warnings that scare users. Open-source doesn't help if the install screen says "can read all your data."

**Prevention:** Request minimum permissions. Use `activeTab` instead of `<all_urls>` where possible. Declare content script matches narrowly. Explain each permission in extension description.

**Phase:** Phase 1 (Manifest configuration)

---

### 14. FastAPI CORS for Chrome Extension

**What:** FastAPI's default CORS config doesn't include `chrome-extension://` origins. Extension API calls fail with CORS errors that are confusing to debug.

**Prevention:** Configure CORSMiddleware to allow `chrome-extension://*` origin pattern in development. In production, restrict to the specific extension ID. Include `X-API-Key` in allowed headers.

**Phase:** Phase 1 (Backend scaffolding)

---

### 15. Offline Q&A Buffer Duplicate Rows

**What:** If pending_qa_pairs retry succeeds but the success response is lost (network timeout), the next retry creates duplicate rows — even with upsert, if field_ids changed.

**Prevention:** Backend upsert by (job_id, field_id) handles exact duplicates. For changed field_ids, add a client-side "synced" flag to pending items. Remove from buffer only after confirmed 200 response with qa_saved: true.

**Phase:** Phase 6

---

## Minor Pitfalls

### 16. Tailwind Dynamic Class Purging

**What:** Tailwind purges unused classes in production builds. Dynamically constructed class names (e.g., `bg-${color}-500`) are purged because Tailwind can't detect them statically.

**Prevention:** Use complete class names in source code. Use Tailwind's safelist config for dynamic classes. Test production build appearance, not just dev build.

**Phase:** Phase 1 (Extension scaffolding)

---

### 17. Plasmo Dev Extension ID Changes

**What:** Plasmo assigns a random extension ID during development. Any hardcoded references to the extension ID (e.g., in CORS config) break on every rebuild.

**Prevention:** Use environment variables for extension ID in backend CORS config. In development, use wildcard `chrome-extension://*`. Pin extension ID in production via Chrome Web Store.

**Phase:** Phase 1

---

### 18. LiteLLM Version Pinning

**What:** LiteLLM ships weekly with potential breaking changes. Using `^1.40.0` or `>=1.40.0` in requirements.txt pulls untested versions on rebuild.

**Prevention:** Pin exact version: `litellm==1.40.0`. Update deliberately after testing. Check LiteLLM changelog before bumping.

**Phase:** Phase 1 (Backend setup)

---

## Sources

- Chrome MV3 documentation — service worker lifecycle (HIGH confidence)
- Plasmo documentation — extension architecture patterns (HIGH confidence)
- LiteLLM documentation — provider differences and configuration (HIGH confidence)
- Supabase documentation — RLS, Storage, client libraries (HIGH confidence)
- WeasyPrint documentation — CSS support matrix (HIGH confidence)
- Training knowledge — common Chrome extension pitfalls (HIGH confidence)

---

*Pitfalls research: 2026-03-04*
