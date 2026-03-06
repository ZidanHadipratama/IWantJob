import { useState, useEffect, useRef, useCallback } from "react"
import { Eye, EyeOff, ChevronDown, ChevronRight } from "lucide-react"
import {
  getStorage,
  setStorage,
  migrateAIConfig,
  type AIConfig,
  type AIModelConfig
} from "~lib/storage"

const PROVIDER_DEFAULTS: Record<string, string> = {
  openai: "gpt-4o",
  anthropic: "claude-sonnet-4-20250514",
  google: "gemini-2.0-flash",
  deepseek: "deepseek-chat",
  ollama: "llama3"
}

const PROVIDER_OPTIONS = [
  { value: "openai", label: "OpenAI" },
  { value: "anthropic", label: "Anthropic" },
  { value: "google", label: "Google Gemini" },
  { value: "deepseek", label: "DeepSeek" },
  { value: "ollama", label: "Ollama (local)" }
]

interface AIConfigCardProps {
  onConfigChange?: (configured: boolean) => void
}

function ModelConfigFields({
  id,
  config,
  onChange,
  showKeyState
}: {
  id: string
  config: AIModelConfig
  onChange: (config: AIModelConfig) => void
  showKeyState: [boolean, (v: boolean) => void]
}) {
  const [showKey, setShowKey] = showKeyState

  return (
    <div className="space-y-3">
      <div>
        <label htmlFor={`${id}-provider`} className="label">
          Provider
        </label>
        <select
          id={`${id}-provider`}
          value={config.provider}
          onChange={(e) => {
            const provider = e.target.value
            const model = PROVIDER_DEFAULTS[provider] || ""
            onChange({ ...config, provider, model })
          }}
          className="input-field">
          {PROVIDER_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor={`${id}-key`} className="label">
          API Key
        </label>
        <div className="relative">
          <input
            id={`${id}-key`}
            type={showKey ? "text" : "password"}
            value={config.api_key}
            onChange={(e) => onChange({ ...config, api_key: e.target.value })}
            placeholder={
              config.provider === "ollama" ? "Not required for Ollama" : "sk-..."
            }
            className="input-field pr-10"
          />
          <button
            type="button"
            aria-label={showKey ? "Hide API key" : "Show API key"}
            onClick={() => setShowKey(!showKey)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary focus:outline-none focus:ring-2 focus:ring-primary/50 rounded cursor-pointer">
            {showKey ? (
              <EyeOff className="w-4 h-4" />
            ) : (
              <Eye className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>

      <div>
        <label htmlFor={`${id}-model`} className="label">
          Model
        </label>
        <input
          id={`${id}-model`}
          type="text"
          value={config.model}
          onChange={(e) => onChange({ ...config, model: e.target.value })}
          placeholder={PROVIDER_DEFAULTS[config.provider] || "model name"}
          className="input-field"
        />
        <p className="text-xs text-text-muted mt-1">
          Suggestion: {PROVIDER_DEFAULTS[config.provider] || "\u2014"}
        </p>
      </div>
    </div>
  )
}

export function AIConfigCard({ onConfigChange }: AIConfigCardProps) {
  const [config, setConfig] = useState<AIConfig>({
    default: { provider: "openai", api_key: "", model: "gpt-4o" }
  })
  const [showDefaultKey, setShowDefaultKey] = useState(false)
  const [showTailorKey, setShowTailorKey] = useState(false)
  const [showFillKey, setShowFillKey] = useState(false)
  const [overridesOpen, setOverridesOpen] = useState(false)
  const [tailorOverride, setTailorOverride] = useState(false)
  const [fillOverride, setFillOverride] = useState(false)
  const [savedIndicator, setSavedIndicator] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    getStorage("ai_config").then((raw) => {
      const migrated = migrateAIConfig(raw)
      setConfig(migrated)
      setTailorOverride(!!migrated.overrides?.tailor)
      setFillOverride(!!migrated.overrides?.fill)
      if (migrated.overrides?.tailor || migrated.overrides?.fill) {
        setOverridesOpen(true)
      }
      // Save migrated config back if it was in old format
      if (raw && !(raw as any).default && (raw as any).provider) {
        setStorage("ai_config", migrated)
      }
    })
  }, [])

  const save = useCallback(
    (newConfig: AIConfig) => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(async () => {
        await setStorage("ai_config", newConfig)
        setSavedIndicator(true)
        setTimeout(() => setSavedIndicator(false), 1500)
        const d = newConfig.default
        onConfigChange?.(
          !!(d.provider && (d.api_key || d.provider === "ollama") && d.model)
        )
      }, 500)
    },
    [onConfigChange]
  )

  function updateDefault(defaultConfig: AIModelConfig) {
    const newConfig = { ...config, default: defaultConfig }
    setConfig(newConfig)
    save(newConfig)
  }

  function updateOverride(
    feature: "tailor" | "fill",
    override: AIModelConfig | undefined
  ) {
    const newConfig = {
      ...config,
      overrides: {
        ...config.overrides,
        [feature]: override
      }
    }
    // Clean up empty overrides
    if (!newConfig.overrides?.tailor && !newConfig.overrides?.fill) {
      delete newConfig.overrides
    }
    setConfig(newConfig)
    save(newConfig)
  }

  function handleTailorToggle(enabled: boolean) {
    setTailorOverride(enabled)
    if (enabled) {
      updateOverride("tailor", {
        provider: config.default.provider,
        api_key: config.default.api_key,
        model: config.default.model
      })
    } else {
      updateOverride("tailor", undefined)
    }
  }

  function handleFillToggle(enabled: boolean) {
    setFillOverride(enabled)
    if (enabled) {
      updateOverride("fill", {
        provider: config.default.provider,
        api_key: config.default.api_key,
        model: config.default.model
      })
    } else {
      updateOverride("fill", undefined)
    }
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-text">AI Provider</h2>
        {savedIndicator && (
          <span className="text-xs text-primary font-medium">Saved</span>
        )}
      </div>

      <div className="space-y-4">
        <p className="text-xs text-text-muted">
          Default model used for all AI features
        </p>
        <ModelConfigFields
          id="ai-default"
          config={config.default}
          onChange={updateDefault}
          showKeyState={[showDefaultKey, setShowDefaultKey]}
        />

        {/* Per-Feature Overrides */}
        <div className="border-t border-gray-200 pt-4">
          <button
            type="button"
            onClick={() => setOverridesOpen(!overridesOpen)}
            className="flex items-center gap-1.5 text-sm font-medium text-text-secondary hover:text-text cursor-pointer">
            {overridesOpen ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
            Per-Feature Overrides
          </button>

          {overridesOpen && (
            <div className="mt-3 space-y-4">
              {/* Tailor Override */}
              <div className="space-y-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={tailorOverride}
                    onChange={(e) => handleTailorToggle(e.target.checked)}
                    className="rounded border-gray-300 text-primary focus:ring-primary"
                  />
                  <span className="text-sm text-text-secondary">
                    Use different model for Resume Tailoring
                  </span>
                </label>
                {tailorOverride && config.overrides?.tailor && (
                  <div className="ml-6 p-3 bg-gray-50 rounded-lg">
                    <ModelConfigFields
                      id="ai-tailor"
                      config={config.overrides.tailor}
                      onChange={(c) => updateOverride("tailor", c)}
                      showKeyState={[showTailorKey, setShowTailorKey]}
                    />
                  </div>
                )}
              </div>

              {/* Fill Override */}
              <div className="space-y-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={fillOverride}
                    onChange={(e) => handleFillToggle(e.target.checked)}
                    className="rounded border-gray-300 text-primary focus:ring-primary"
                  />
                  <span className="text-sm text-text-secondary">
                    Use different model for Form Fill
                  </span>
                </label>
                {fillOverride && config.overrides?.fill && (
                  <div className="ml-6 p-3 bg-gray-50 rounded-lg">
                    <ModelConfigFields
                      id="ai-fill"
                      config={config.overrides.fill}
                      onChange={(c) => updateOverride("fill", c)}
                      showKeyState={[showFillKey, setShowFillKey]}
                    />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
