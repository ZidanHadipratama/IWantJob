import { useState, useEffect, useRef, useCallback } from "react"
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
  const onConfigChangeRef = useRef(onConfigChange)
  onConfigChangeRef.current = onConfigChange

  useEffect(() => {
    getStorage("db_config").then((config) => {
      if (config) {
        setSupabaseUrl(config.supabase_url || "")
        setSupabaseKey(config.supabase_key || "")
        onConfigChangeRef.current?.(
          !!(config.supabase_url && config.supabase_key)
        )
      }
    })
  }, [])

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
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-text">Database Connection</h2>
        {savedIndicator && (
          <span className="text-xs text-primary font-medium">Saved</span>
        )}
      </div>

      <div className="space-y-4">
        <div>
          <label htmlFor="supabase-url" className="label">
            Supabase Project URL
          </label>
          <input
            id="supabase-url"
            type="url"
            value={supabaseUrl}
            onChange={(e) => handleUrlChange(e.target.value)}
            placeholder="https://your-project.supabase.co"
            className="input-field"
          />
        </div>

        <div>
          <label htmlFor="supabase-key" className="label">
            Supabase Service Role Key
          </label>
          <p className="text-xs text-text-muted mb-1">
            Find this in Supabase Dashboard &gt; Settings &gt; API &gt; service_role key (secret). This key bypasses Row Level Security.
          </p>
          <div className="relative">
            <input
              id="supabase-key"
              type={showKey ? "text" : "password"}
              value={supabaseKey}
              onChange={(e) => handleKeyChange(e.target.value)}
              placeholder="eyJ..."
              className="input-field pr-10"
            />
            <button
              type="button"
              aria-label={showKey ? "Hide service role key" : "Show service role key"}
              onClick={() => setShowKey((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary focus:outline-none focus:ring-2 focus:ring-primary/50 rounded cursor-pointer">
              {showKey ? (
                <EyeOff className="w-4 h-4" />
              ) : (
                <Eye className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleTestConnection}
            disabled={connectionStatus === "loading"}
            className="btn-primary">
            {connectionStatus === "loading" && (
              <Loader className="w-4 h-4 animate-spin" />
            )}
            Test Connection
          </button>

          {connectionStatus === "success" && (
            <div className="flex items-center gap-1.5 text-primary">
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
