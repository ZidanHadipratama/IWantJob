import { useState, useEffect, useRef, useCallback } from "react"
import { getStorage, setStorage } from "~lib/storage"

const DEFAULT_BACKEND_URL = "http://localhost:8000"

interface BackendConfigCardProps {
  onConfigChange?: (configured: boolean) => void
}

export function BackendConfigCard({ onConfigChange }: BackendConfigCardProps) {
  const [backendUrl, setBackendUrl] = useState(DEFAULT_BACKEND_URL)
  const [savedIndicator, setSavedIndicator] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const onConfigChangeRef = useRef(onConfigChange)
  onConfigChangeRef.current = onConfigChange

  useEffect(() => {
    getStorage("backend_url").then((url) => {
      if (url) {
        setBackendUrl(url)
        onConfigChangeRef.current?.(!!url)
      } else {
        setBackendUrl(DEFAULT_BACKEND_URL)
        onConfigChangeRef.current?.(true)
      }
    })
  }, [])

  const save = useCallback(
    (value: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(async () => {
        await setStorage("backend_url", value)
        setSavedIndicator(true)
        setTimeout(() => setSavedIndicator(false), 1500)
        onConfigChange?.(!!value)
      }, 500)
    },
    [onConfigChange]
  )

  function handleChange(value: string) {
    setBackendUrl(value)
    save(value)
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
      </div>
    </div>
  )
}
