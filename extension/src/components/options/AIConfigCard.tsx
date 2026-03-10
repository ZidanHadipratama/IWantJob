import { useState, useEffect, useRef, useCallback } from "react"
import {
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  Loader,
  XCircle
} from "lucide-react"

import { createApiClient, type ServiceCheckResult } from "~lib/api"
import {
  getStorage,
  setStorage,
  migrateAIConfig,
  type AIConfig,
  type AIModelConfig
} from "~lib/storage"

import type { SetupStatus } from "./SetupProgress"

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
  onStatusChange?: (status: SetupStatus) => void
}

interface ModelTestStatus {
  status: "idle" | "loading" | "success" | "error"
  message: string
}

function isModelConfigured(config: AIModelConfig | undefined): config is AIModelConfig {
  if (!config) return false
  return !!(config.provider && config.model && (config.api_key || config.provider === "ollama"))
}

function deriveSetupStatus(
  config: AIConfig,
  tailorOverride: boolean,
  fillOverride: boolean,
  tests?: Record<string, ModelTestStatus>
): SetupStatus {
  const activeConfigs = [config.default]
  if (tailorOverride) activeConfigs.push(config.overrides?.tailor as AIModelConfig)
  if (fillOverride) activeConfigs.push(config.overrides?.fill as AIModelConfig)

  if (activeConfigs.some((entry) => !isModelConfigured(entry))) {
    return "missing"
  }

  const testStatuses = Object.values(tests || {})
  if (testStatuses.some((entry) => entry.status === "error")) {
    return "error"
  }
  if (
    testStatuses.length > 0 &&
    testStatuses.every((entry) => entry.status === "success") &&
    testStatuses.length >= activeConfigs.length
  ) {
    return "healthy"
  }
  return "configured"
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
          Suggestion: {PROVIDER_DEFAULTS[config.provider] || "-"}
        </p>
      </div>
    </div>
  )
}

function StatusLine({
  label,
  result
}: {
  label: string
  result: ModelTestStatus | undefined
}) {
  if (!result || result.status === "idle") {
    return null
  }

  if (result.status === "loading") {
    return (
      <div className="flex items-center gap-2 text-sm text-text-muted">
        <Loader className="w-4 h-4 animate-spin" />
        <span>{label}: testing…</span>
      </div>
    )
  }

  if (result.status === "success") {
    return (
      <div className="flex items-center gap-2 text-sm text-primary">
        <CheckCircle className="w-4 h-4" />
        <span>{label}: {result.message}</span>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 text-sm text-red-600">
      <XCircle className="w-4 h-4" />
      <span>{label}: {result.message}</span>
    </div>
  )
}

export function AIConfigCard({ onStatusChange }: AIConfigCardProps) {
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
  const [testingActiveModels, setTestingActiveModels] = useState(false)
  const [testResults, setTestResults] = useState<Record<string, ModelTestStatus>>({})
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onStatusChangeRef = useRef(onStatusChange)

  onStatusChangeRef.current = onStatusChange

  useEffect(() => {
    getStorage("ai_config").then((raw) => {
      const migrated = migrateAIConfig(raw)
      const hasTailorOverride = !!migrated.overrides?.tailor
      const hasFillOverride = !!migrated.overrides?.fill

      setConfig(migrated)
      setTailorOverride(hasTailorOverride)
      setFillOverride(hasFillOverride)
      if (hasTailorOverride || hasFillOverride) {
        setOverridesOpen(true)
      }
      if (raw && !(raw as any).default && (raw as any).provider) {
        setStorage("ai_config", migrated)
      }

      onStatusChangeRef.current?.(
        deriveSetupStatus(migrated, hasTailorOverride, hasFillOverride)
      )
    })
  }, [])

  const save = useCallback(
    (newConfig: AIConfig, nextTailorOverride = tailorOverride, nextFillOverride = fillOverride) => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(async () => {
        await setStorage("ai_config", newConfig)
        setSavedIndicator(true)
        setTimeout(() => setSavedIndicator(false), 1500)
        setTestResults({})
        onStatusChange?.(deriveSetupStatus(newConfig, nextTailorOverride, nextFillOverride))
      }, 500)
    },
    [fillOverride, onStatusChange, tailorOverride]
  )

  function updateDefault(defaultConfig: AIModelConfig) {
    const newConfig = { ...config, default: defaultConfig }
    setConfig(newConfig)
    setTestResults({})
    onStatusChange?.(deriveSetupStatus(newConfig, tailorOverride, fillOverride))
    save(newConfig)
  }

  function updateOverride(
    feature: "tailor" | "fill",
    override: AIModelConfig | undefined,
    nextTailorOverride = tailorOverride,
    nextFillOverride = fillOverride
  ) {
    const newConfig = {
      ...config,
      overrides: {
        ...config.overrides,
        [feature]: override
      }
    }
    if (!newConfig.overrides?.tailor && !newConfig.overrides?.fill) {
      delete newConfig.overrides
    }
    setConfig(newConfig)
    setTestResults({})
    onStatusChange?.(deriveSetupStatus(newConfig, nextTailorOverride, nextFillOverride))
    save(newConfig, nextTailorOverride, nextFillOverride)
  }

  function handleTailorToggle(enabled: boolean) {
    setTailorOverride(enabled)
    if (enabled) {
      updateOverride(
        "tailor",
        {
          provider: config.default.provider,
          api_key: config.default.api_key,
          model: config.default.model
        },
        true,
        fillOverride
      )
    } else {
      updateOverride("tailor", undefined, false, fillOverride)
    }
  }

  function handleFillToggle(enabled: boolean) {
    setFillOverride(enabled)
    if (enabled) {
      updateOverride(
        "fill",
        {
          provider: config.default.provider,
          api_key: config.default.api_key,
          model: config.default.model
        },
        tailorOverride,
        true
      )
    } else {
      updateOverride("fill", undefined, tailorOverride, false)
    }
  }

  async function runProbe(
    key: "default" | "tailor" | "fill",
    modelConfig: AIModelConfig,
    label: string
  ): Promise<ServiceCheckResult> {
    setTestResults((prev) => ({
      ...prev,
      [key]: { status: "loading", message: `Testing ${label.toLowerCase()}...` }
    }))
    const client = await createApiClient()
    const result = await client.testAI(modelConfig)
    setTestResults((prev) => ({
      ...prev,
      [key]: {
        status: result.connected ? "success" : "error",
        message: result.message
      }
    }))
    return result
  }

  async function handleTestActiveModels() {
    const probes: Array<{
      key: "default" | "tailor" | "fill"
      label: string
      config: AIModelConfig | undefined
    }> = [
      { key: "default", label: "Default", config: config.default }
    ]

    if (tailorOverride) {
      probes.push({ key: "tailor", label: "Resume Tailoring", config: config.overrides?.tailor })
    }
    if (fillOverride) {
      probes.push({ key: "fill", label: "Form Fill", config: config.overrides?.fill })
    }

    if (probes.some((probe) => !isModelConfigured(probe.config))) {
      onStatusChange?.("missing")
      setTestResults({
        default: {
          status: "error",
          message: "Complete provider, model, and API key before testing."
        }
      })
      return
    }

    setTestingActiveModels(true)
    try {
      let hasFailure = false
      for (const probe of probes) {
        const result = await runProbe(probe.key, probe.config as AIModelConfig, probe.label)
        if (!result.connected) {
          hasFailure = true
        }
      }
      onStatusChange?.(hasFailure ? "error" : "healthy")
    } catch {
      setTestResults((prev) => ({
        ...prev,
        default: {
          status: "error",
          message: "Unexpected error while testing AI configuration."
        }
      }))
      onStatusChange?.("error")
    } finally {
      setTestingActiveModels(false)
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

        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-text">Live AI Check</p>
              <p className="text-xs text-text-muted">
                Runs a tiny prompt that expects the exact response <code>OK</code>.
              </p>
            </div>
            <button
              type="button"
              onClick={handleTestActiveModels}
              disabled={testingActiveModels}
              className="btn-primary">
              {testingActiveModels && (
                <Loader className="w-4 h-4 animate-spin" />
              )}
              Test Active Models
            </button>
          </div>

          <div className="mt-3 space-y-2">
            <StatusLine label="Default" result={testResults.default} />
            {tailorOverride && <StatusLine label="Resume Tailoring" result={testResults.tailor} />}
            {fillOverride && <StatusLine label="Form Fill" result={testResults.fill} />}
          </div>
        </div>
      </div>
    </div>
  )
}
