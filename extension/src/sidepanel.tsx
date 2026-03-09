import { useState, useEffect } from "react"
import { ClipboardList, FileText, LayoutGrid, Bug } from "lucide-react"

import "./style.css"

import FillForm from "./components/sidepanel/FillForm"
import Resume from "./components/sidepanel/Resume"
import TrackerTable from "./components/sidepanel/TrackerTable"
import { debug } from "~lib/debug"
import { getStorage, normalizeActiveJobContext, type ActiveJobContext } from "~lib/storage"

type Tab = "fill-form" | "resume" | "tracker" | "debug"

const tabs: { id: Tab; label: string; icon: typeof ClipboardList }[] = [
  { id: "resume", label: "Resume", icon: FileText },
  { id: "fill-form", label: "Fill Form", icon: ClipboardList },
  { id: "tracker", label: "Tracker", icon: LayoutGrid },
  { id: "debug", label: "Logs", icon: Bug },
]

function DebugPanel() {
  const [logs, setLogs] = useState<string[]>([])

  function loadLogs() {
    chrome.storage.local.get("debug_log", (result) => {
      setLogs(result.debug_log || [])
    })
  }

  function clearLogs() {
    chrome.storage.local.remove("debug_log", () => {
      setLogs([])
    })
  }

  useEffect(() => {
    loadLogs()
    // Auto-refresh every 2s
    const interval = setInterval(loadLogs, 2000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-text">Debug Logs</h2>
        <div className="flex gap-2">
          <button onClick={loadLogs} className="text-xs text-primary hover:text-primary-700 font-medium cursor-pointer">
            Refresh
          </button>
          <button onClick={clearLogs} className="text-xs text-red-500 hover:text-red-700 font-medium cursor-pointer">
            Clear
          </button>
        </div>
      </div>
      {logs.length === 0 ? (
        <p className="text-xs text-text-muted">No logs yet. Click buttons in other tabs to generate logs.</p>
      ) : (
        <div className="bg-gray-900 rounded-lg p-3 max-h-[calc(100vh-120px)] overflow-y-auto">
          {logs.map((line, i) => (
            <pre key={i} className={`text-xs font-mono whitespace-pre-wrap break-all mb-0.5 ${
              line.includes("[ERROR") ? "text-red-400" : "text-green-400"
            }`}>{line}</pre>
          ))}
        </div>
      )}
    </div>
  )
}

function SidePanel() {
  const [context, setContext] = useState<ActiveJobContext | null>(null)

  useEffect(() => {
    debug("SidePanel", "Mounted")

    let mounted = true
    getStorage("active_job_context").then((value) => {
      if (mounted) setContext(normalizeActiveJobContext(value))
    })

    function handleStorageChange(
      changes: Record<string, chrome.storage.StorageChange>,
      areaName: string
    ) {
      if (areaName !== "local" || !changes.active_job_context) return
      setContext(normalizeActiveJobContext(changes.active_job_context.newValue))
    }

    chrome.storage.onChanged.addListener(handleStorageChange)
    return () => {
      mounted = false
      chrome.storage.onChanged.removeListener(handleStorageChange)
    }
  }, [])

  const [activeTab, setActiveTab] = useState<Tab>("resume")
  const statusTone = !context
    ? "border-slate-200 bg-slate-50 text-text-muted"
    : context.phase !== "tailored"
      ? "border-amber-100 bg-amber-50 text-amber-800"
      : context.persistence_state === "saved"
        ? "border-emerald-100 bg-emerald-50 text-emerald-800"
        : "border-sky-100 bg-sky-50 text-sky-800"
  const statusMessage = !context
    ? "No active application draft yet."
    : context.phase !== "tailored"
      ? "Draft in progress. Resume tailoring is not finished yet."
      : context.persistence_state === "saved"
        ? `Saved application: ${context.job_title || "current role"}${context.company ? ` at ${context.company}` : ""}`
        : `Unsaved draft: ${context.job_title || "current role"}${context.company ? ` at ${context.company}` : ""}`

  return (
    <div className="flex flex-col h-screen bg-surface-secondary">
      <nav className="flex bg-white border-b border-gray-200">
        {tabs.map((tab) => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-semibold transition-colors duration-150 cursor-pointer ${
                isActive
                  ? "border-b-2 border-primary text-primary"
                  : "text-text-muted hover:text-text-secondary"
              }`}
              aria-current={isActive ? "page" : undefined}>
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          )
        })}
      </nav>
      <div className={`border-b px-4 py-2 text-[11px] font-medium ${statusTone}`}>
        {statusMessage}
      </div>
      <main className="flex-1 overflow-auto p-4">
        {activeTab === "fill-form" && <FillForm />}
        {activeTab === "resume" && <Resume />}
        {activeTab === "tracker" && <TrackerTable />}
        {activeTab === "debug" && <DebugPanel />}
      </main>
    </div>
  )
}

export default SidePanel
