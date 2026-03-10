import { useState, useEffect, useRef, useCallback } from "react"
import { CheckCircle, Loader, XCircle } from "lucide-react"

import { createApiClient } from "~lib/api"
import { getStorage, setStorage } from "~lib/storage"

import type { SetupStatus } from "./SetupProgress"

const DEFAULT_BACKEND_URL = "http://localhost:8000"

interface BackendConfigCardProps {
  onStatusChange?: (status: SetupStatus) => void
}

type ConnectionStatus = "idle" | "loading" | "success" | "error"

export function BackendConfigCard({ onStatusChange }: BackendConfigCardProps) {
  const [backendUrl, setBackendUrl] = useState(DEFAULT_BACKEND_URL)
  const [savedIndicator, setSavedIndicator] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("idle")
  const [connectionMessage, setConnectionMessage] = useState("")
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const onStatusChangeRef = useRef(onStatusChange)
  onStatusChangeRef.current = onStatusChange

  useEffect(() => {
    getStorage("backend_url").then((url) => {
      if (url) {
        setBackendUrl(url)
      } else {
        setBackendUrl(DEFAULT_BACKEND_URL)
      }
      onStatusChangeRef.current?.("configured")
    })
  }, [])

  const save = useCallback(
    (value: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(async () => {
        await setStorage("backend_url", value)
        setSavedIndicator(true)
        setTimeout(() => setSavedIndicator(false), 1500)
        setConnectionStatus("idle")
        setConnectionMessage("")
        onStatusChange?.(value ? "configured" : "missing")
      }, 500)
    },
    [onStatusChange]
  )

  function handleChange(value: string) {
    setBackendUrl(value)
    save(value)
  }

  async function handleTestConnection() {
    setConnectionStatus("loading")
    setConnectionMessage("")
    try {
      const client = await createApiClient()
      const result = await client.testBackendHealth()
      setConnectionStatus(result.connected ? "success" : "error")
      setConnectionMessage(result.message)
      onStatusChange?.(result.connected ? "healthy" : "error")
    } catch {
      setConnectionStatus("error")
      setConnectionMessage("Unexpected error while testing backend")
      onStatusChange?.("error")
    }
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-text">Backend Connection</h2>
        {savedIndicator && (
          <span className="text-xs text-primary font-medium">Saved</span>
        )}
      </div>

      <div>
        <label htmlFor="backend-url" className="label">
          Backend URL
        </label>
        <input
          id="backend-url"
          type="url"
          value={backendUrl}
          onChange={(e) => handleChange(e.target.value)}
          placeholder={DEFAULT_BACKEND_URL}
          className="input-field"
        />
        <p className="text-xs text-text-muted mt-1">
          Default: {DEFAULT_BACKEND_URL} — change if deploying to cloud
        </p>

        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            onClick={handleTestConnection}
            disabled={connectionStatus === "loading"}
            className="btn-primary">
            {connectionStatus === "loading" && (
              <Loader className="w-4 h-4 animate-spin" />
            )}
            Test Backend
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
