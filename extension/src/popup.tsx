import { useState, useEffect } from "react"
import { Settings, PanelRight, CheckCircle, XCircle } from "lucide-react"
import { getStorage } from "~lib/storage"
import BrandMark from "~components/BrandMark"

import "./style.css"

function Popup() {
  const [backendOk, setBackendOk] = useState<boolean | null>(null)

  useEffect(() => {
    async function check() {
      try {
        const url = (await getStorage("backend_url")) || "http://localhost:8000"
        const res = await fetch(`${url}/health`, { method: "GET" })
        setBackendOk(res.ok)
      } catch {
        setBackendOk(false)
      }
    }
    check()
  }, [])

  function openSidePanel() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.sidePanel.open({ tabId: tabs[0].id })
      }
    })
    window.close()
  }

  function openOptions() {
    chrome.runtime.openOptionsPage()
    window.close()
  }

  return (
    <div className="w-72 p-5 font-sans">
      <div className="flex items-center gap-2.5 mb-4">
        <BrandMark size="sm" showWordmark={false} />
        <div>
          <h1 className="text-base font-bold text-text">IWantJob</h1>
          <div className="flex items-center gap-1.5">
            {backendOk === null ? (
              <span className="text-xs text-text-muted">Checking...</span>
            ) : backendOk ? (
              <>
                <CheckCircle className="w-3 h-3 text-primary" />
                <span className="text-xs text-primary font-medium">Backend connected</span>
              </>
            ) : (
              <>
                <XCircle className="w-3 h-3 text-red-500" />
                <span className="text-xs text-red-500 font-medium">Backend offline</span>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <button onClick={openSidePanel} className="w-full btn-primary justify-center">
          <PanelRight className="w-4 h-4" />
          Open Side Panel
        </button>
        <button onClick={openOptions} className="w-full btn-secondary justify-center">
          <Settings className="w-4 h-4" />
          Settings
        </button>
      </div>
    </div>
  )
}

export default Popup
