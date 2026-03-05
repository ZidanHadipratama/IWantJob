import React, { useState, useEffect, useRef, useCallback } from "react"
import { Eye, EyeOff, CheckCircle, XCircle, Loader } from "lucide-react"
import { getStorage, setStorage, type DBConfig } from "~lib/storage"
import { createApiClient } from "~lib/api"

interface SupabaseConfigCardProps {
  onConfigChange?: (configured: boolean) => void
}

type ConnectionStatus = "idle" | "loading" | "success" | "error"

export function SupabaseConfigCard({ onConfigChange }: SupabaseConfigCardProps) {
  const [supabaseUrl, setSupabaseUrl] = useState("")
  const [supabaseKey, setSupabaseKey] = useState("")
  const [showKey, setShowKey] = useState(false)
  const [savedIndicator, setSavedIndicator] = useState(false)
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>("idle")
  const [connectionMessage, setConnectionMessage] = useState("")
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    getStorage("db_config").then((config) => {
      if (config) {
        setSupabaseUrl(config.supabase_url || "")
        setSupabaseKey(config.supabase_key || "")
        onConfigChange?.(
          !!(config.supabase_url && config.supabase_key)
        )
      }
    })
  }, [onConfigChange])

  const save = useCallback(
    (config: DBConfig) => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(async () => {
        await setStorage("db_config", config)
        setSavedIndicator(true)
        setTimeout(() => setSavedIndicator(false), 1500)
        onConfigChange?.(
          !!(config.supabase_url && config.supabase_key)
        )
      }, 500)
    },
    [onConfigChange]
  )

  function handleUrlChange(value: string) {
    setSupabaseUrl(value)
    save({ supabase_url: value, supabase_key: supabaseKey })
  }

  function handleKeyChange(value: string) {
    setSupabaseKey(value)
    save({ supabase_url: supabaseUrl, supabase_key: value })
  }

  async function handleTestConnection() {
    setConnectionStatus("loading")
    setConnectionMessage("")
    try {
      const client = await createApiClient()
      const result = await client.testConnection()
      setConnectionStatus(result.connected ? "success" : "error")
      setConnectionMessage(result.message)
    } catch {
      setConnectionStatus("error")
      setConnectionMessage("Unexpected error — check console")
    }
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-gray-800">
          Database Connection
        </h2>
        {savedIndicator && (
          <span className="text-xs text-green-600 font-medium">Saved</span>
        )}
      </div>

      <div className="space-y-4">
        {/* Supabase URL */}
        <div>
          <label
            htmlFor="supabase-url"
            className="block text-sm font-medium text-gray-700 mb-1">
            Supabase Project URL
          </label>
          <input
            id="supabase-url"
            type="url"
            value={supabaseUrl}
            onChange={(e) => handleUrlChange(e.target.value)}
            placeholder="https://your-project.supabase.co"
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        {/* Service Role Key */}
        <div>
          <label
            htmlFor="supabase-key"
            className="block text-sm font-medium text-gray-700 mb-1">
            Supabase Service Role Key
          </label>
          <p className="text-xs text-gray-500 mb-1">
            Find this in Supabase Dashboard -&gt; Settings -&gt; API -&gt; service_role key (secret). This key bypasses Row Level Security.
          </p>
          <div className="relative">
            <input
              id="supabase-key"
              type={showKey ? "text" : "password"}
              value={supabaseKey}
              onChange={(e) => handleKeyChange(e.target.value)}
              placeholder="eyJ..."
              className="w-full border border-gray-300 rounded-md px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <button
              type="button"
              aria-label={showKey ? "Hide service role key" : "Show service role key"}
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

        {/* Test Connection button + status */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleTestConnection}
            disabled={connectionStatus === "loading"}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed transition-colors">
            {connectionStatus === "loading" && (
              <Loader className="w-4 h-4 animate-spin" />
            )}
            Test Connection
          </button>

          {connectionStatus === "success" && (
            <div className="flex items-center gap-1.5 text-green-600">
              <CheckCircle className="w-4 h-4" />
              <span className="text-sm">{connectionMessage}</span>
            </div>
          )}

          {connectionStatus === "error" && (
            <div className="flex items-center gap-1.5 text-red-600">
              <XCircle className="w-4 h-4" />
              <span className="text-sm">{connectionMessage}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
