import { useState, useEffect } from "react"
import { ClipboardList, FileText, LayoutGrid, Bug } from "lucide-react"

import "./style.css"

import FillForm from "./components/sidepanel/FillForm"
import Resume from "./components/sidepanel/Resume"
import TrackerTable from "./components/sidepanel/TrackerTable"
import { debug } from "~lib/debug"

type Tab = "fill-form" | "resume" | "tracker" | "debug"

const tabs: { id: Tab; label: string; icon: typeof ClipboardList }[] = [
  { id: "fill-form", label: "Fill Form", icon: ClipboardList },
  { id: "resume", label: "Resume", icon: FileText },
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
  useEffect(() => {
    debug("SidePanel", "Mounted")
  }, [])

  const [activeTab, setActiveTab] = useState<Tab>("fill-form")

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
