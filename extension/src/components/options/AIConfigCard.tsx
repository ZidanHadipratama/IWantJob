import React, { useState, useEffect, useRef, useCallback } from "react"
import { Eye, EyeOff } from "lucide-react"
import { getStorage, setStorage, type AIConfig } from "~lib/storage"

const PROVIDER_DEFAULTS: Record<string, string> = {
  openai: "gpt-4o",
  anthropic: "claude-sonnet-4-20250514",
  google: "gemini-2.0-flash",
  ollama: "llama3"
}

const PROVIDER_OPTIONS = [
  { value: "openai", label: "OpenAI" },
  { value: "anthropic", label: "Anthropic" },
  { value: "google", label: "Google Gemini" },
  { value: "ollama", label: "Ollama (local)" }
]

interface AIConfigCardProps {
  onConfigChange?: (configured: boolean) => void
}

export function AIConfigCard({ onConfigChange }: AIConfigCardProps) {
  const [provider, setProvider] = useState("openai")
  const [apiKey, setApiKey] = useState("")
  const [model, setModel] = useState(PROVIDER_DEFAULTS["openai"])
  const [showKey, setShowKey] = useState(false)
  const [savedIndicator, setSavedIndicator] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Load initial values from storage
  useEffect(() => {
    getStorage("ai_config").then((config) => {
      if (config) {
        setProvider(config.provider || "openai")
        setApiKey(config.api_key || "")
        setModel(config.model || PROVIDER_DEFAULTS[config.provider || "openai"])
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
        onConfigChange?.(
          !!(newConfig.provider && newConfig.api_key && newConfig.model)
        )
      }, 500)
    },
    [onConfigChange]
  )

  function handleProviderChange(value: string) {
    setProvider(value)
    const suggested = PROVIDER_DEFAULTS[value] || ""
    setModel(suggested)
    save({ provider: value, api_key: apiKey, model: suggested })
  }

  function handleApiKeyChange(value: string) {
    setApiKey(value)
    save({ provider, api_key: value, model })
  }

  function handleModelChange(value: string) {
    setModel(value)
    save({ provider, api_key: apiKey, model: value })
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-gray-800">AI Provider</h2>
        {savedIndicator && (
          <span className="text-xs text-green-600 font-medium">Saved</span>
        )}
      </div>

      <div className="space-y-4">
        {/* Provider dropdown */}
        <div>
          <label
            htmlFor="ai-provider"
            className="block text-sm font-medium text-gray-700 mb-1">
            Provider
          </label>
          <select
            id="ai-provider"
            value={provider}
            onChange={(e) => handleProviderChange(e.target.value)}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent">
            {PROVIDER_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* API Key */}
        <div>
          <label
            htmlFor="ai-api-key"
            className="block text-sm font-medium text-gray-700 mb-1">
            API Key
          </label>
          <div className="relative">
            <input
              id="ai-api-key"
              type={showKey ? "text" : "password"}
              value={apiKey}
              onChange={(e) => handleApiKeyChange(e.target.value)}
              placeholder={
                provider === "ollama" ? "Not required for Ollama" : "sk-..."
              }
              className="w-full border border-gray-300 rounded-md px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <button
              type="button"
              aria-label={showKey ? "Hide API key" : "Show API key"}
              onClick={() => setShowKey((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded">
              {showKey ? (
                <EyeOff className="w-4 h-4" />
              ) : (
                <Eye className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>

        {/* Model name */}
        <div>
          <label
            htmlFor="ai-model"
            className="block text-sm font-medium text-gray-700 mb-1">
            Model
          </label>
          <input
            id="ai-model"
            type="text"
            value={model}
            onChange={(e) => handleModelChange(e.target.value)}
            placeholder={PROVIDER_DEFAULTS[provider] || "model name"}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <p className="text-xs text-gray-400 mt-1">
            Suggestion: {PROVIDER_DEFAULTS[provider] || "—"}
          </p>
        </div>
      </div>
    </div>
  )
}
