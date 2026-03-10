import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { CheckCircle, Copy, HelpCircle } from "lucide-react"

import { getStorage, setStorage } from "~lib/storage"

const PERSONA_PROMPT = `Help me create a reusable job application persona for an AI job application assistant.

Base it on our past chats and/or the answers I provide below. Write practical freeform text I can paste into another tool.

Include:
- Core principles and values
- Motivations and what kind of work matters to me
- Communication style
- Working style
- Collaboration / leadership style
- Strengths and distinguishing traits
- Preferred environments and team dynamics
- A short personal narrative or mission statement

Important rules:
- Do not invent job history, achievements, credentials, or technical skills that are not explicitly supported.
- Do not exaggerate experience.
- Keep it grounded, useful, and written in first person.
- Make it concise enough to paste into a settings field, but rich enough to help answer application questions.

If you need more context first, ask me a few targeted questions before writing the final persona.`

export function PersonaCard() {
  const [personaText, setPersonaText] = useState("")
  const [savedIndicator, setSavedIndicator] = useState(false)
  const [helperOpen, setHelperOpen] = useState(false)
  const [promptCopied, setPromptCopied] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    getStorage("persona_text").then((value) => {
      setPersonaText(typeof value === "string" ? value : "")
    })
  }, [])

  const save = useCallback((value: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      await setStorage("persona_text", value)
      setSavedIndicator(true)
      setTimeout(() => setSavedIndicator(false), 1500)
    }, 500)
  }, [])

  function handleChange(value: string) {
    setPersonaText(value)
    save(value)
  }

  async function handleCopyPrompt() {
    await navigator.clipboard.writeText(PERSONA_PROMPT)
    setPromptCopied(true)
    setTimeout(() => setPromptCopied(false), 1500)
  }

  const helperSummary = useMemo(() => {
    return helperOpen
      ? "Use this prompt in ChatGPT or a similar tool, then paste the result back here."
      : "Need help creating one?"
  }, [helperOpen])

  return (
    <div className="card">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="text-base font-semibold text-text">Persona</h2>
          <p className="text-sm text-text-muted mt-1">
            Optional narrative context for principles, motivations, working style, and voice that does not belong in the resume.
          </p>
        </div>
        {savedIndicator && (
          <span className="text-xs text-primary font-medium">Saved</span>
        )}
      </div>

      <div className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-900 mb-4">
        Persona is optional. It helps the AI answer application questions with better framing, but it should not be used to invent factual work history or credentials.
      </div>

      <div className="mb-4">
        <div className="flex items-center justify-between gap-3 mb-2">
          <label htmlFor="persona-text" className="label mb-0">
            Persona Text
          </label>
          <button
            type="button"
            onClick={() => setHelperOpen((value) => !value)}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary-dark cursor-pointer"
          >
            <HelpCircle className="w-3.5 h-3.5" />
            {helperSummary}
          </button>
        </div>
        <textarea
          id="persona-text"
          value={personaText}
          onChange={(e) => handleChange(e.target.value)}
          placeholder="Paste your persona here. Example themes: principles, motivations, communication style, working style, strengths, and personal narrative."
          rows={10}
          className="input-field min-h-[220px] resize-y"
        />
        <p className="text-xs text-text-muted mt-2">
          This is used as optional narrative context for application answers. You can leave it empty.
        </p>
      </div>

      {helperOpen && (
        <div className="rounded-xl border border-primary-100 bg-primary-50/50 p-4 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-text">Generate Your Persona Externally</h3>
              <p className="text-xs text-text-muted mt-1">
                Paste this prompt into ChatGPT or a similar tool. If needed, let it ask you a few follow-up questions first, then paste the final persona back into the field above.
              </p>
            </div>
            <button
              type="button"
              onClick={handleCopyPrompt}
              className="btn-secondary text-xs px-3 py-1.5 flex-shrink-0"
            >
              {promptCopied ? (
                <>
                  <CheckCircle className="w-3.5 h-3.5" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  Copy Prompt
                </>
              )}
            </button>
          </div>

          <pre className="whitespace-pre-wrap rounded-lg bg-white border border-primary-100 p-3 text-xs leading-5 text-text-secondary overflow-x-auto">
            {PERSONA_PROMPT}
          </pre>
        </div>
      )}
    </div>
  )
}
