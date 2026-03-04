import React, { useState, useEffect, useRef, useCallback } from "react"
import { getStorage, setStorage } from "~lib/storage"

const DEFAULT_BACKEND_URL = "http://localhost:8000"

interface BackendConfigCardProps {
  onConfigChange?: (configured: boolean) => void
}

export function BackendConfigCard({ onConfigChange }: BackendConfigCardProps) {
  const [backendUrl, setBackendUrl] = useState(DEFAULT_BACKEND_URL)
  const [savedIndicator, setSavedIndicator] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    getStorage("backend_url").then((url) => {
      if (url) {
        setBackendUrl(url)
        onConfigChange?.(!!url)
      } else {
        // Set default if not stored
        setBackendUrl(DEFAULT_BACKEND_URL)
        onConfigChange?.(true)
      }
    })
  }, [onConfigChange])

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
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-gray-800">
          Backend Connection
        </h2>
        {savedIndicator && (
          <span className="text-xs text-green-600 font-medium">Saved</span>
        )}
      </div>

      <div>
        <label
          htmlFor="backend-url"
          className="block text-sm font-medium text-gray-700 mb-1">
          Backend URL
        </label>
        <input
          id="backend-url"
          type="url"
          value={backendUrl}
          onChange={(e) => handleChange(e.target.value)}
          placeholder={DEFAULT_BACKEND_URL}
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        <p className="text-xs text-gray-400 mt-1">
          Default: {DEFAULT_BACKEND_URL} — change if deploying to cloud
        </p>
      </div>
    </div>
  )
}
