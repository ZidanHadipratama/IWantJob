import { useState, useEffect } from "react"
import { ClipboardList, FileText, ScrollText } from "lucide-react"

import "./style.css"

import FillForm from "./components/sidepanel/FillForm"
import CoverLetter from "./components/sidepanel/CoverLetter"
import Resume from "./components/sidepanel/Resume"
import BrandMark from "./components/BrandMark"
import { debug } from "~lib/debug"
import { getStorage, normalizeActiveJobContext, setStorage, type ActiveJobContext } from "~lib/storage"

type Tab = "fill-form" | "resume" | "cover-letter"

const tabs: { id: Tab; label: string; icon: typeof ClipboardList }[] = [
  { id: "resume", label: "Resume", icon: FileText },
  { id: "cover-letter", label: "Cover Letter", icon: ScrollText },
  { id: "fill-form", label: "Fill Form", icon: ClipboardList },
]

function SidePanel() {
  const [context, setContext] = useState<ActiveJobContext | null>(null)
  const [activeTab, setActiveTab] = useState<Tab>("resume")

  useEffect(() => {
    debug("SidePanel", "Mounted")

    let mounted = true
    Promise.all([
      getStorage("active_job_context"),
      getStorage("sidepanel_active_tab")
    ]).then(([value, savedTab]) => {
      if (!mounted) return
      setContext(normalizeActiveJobContext(value))
      if (savedTab === "resume" || savedTab === "cover-letter" || savedTab === "fill-form") {
        setActiveTab(savedTab)
      } else if (savedTab) {
        void setStorage("sidepanel_active_tab", "resume")
      }
    })

    function handleStorageChange(
      changes: Record<string, chrome.storage.StorageChange>,
      areaName: string
    ) {
      if (areaName !== "local") return
      if (changes.active_job_context) {
        setContext(normalizeActiveJobContext(changes.active_job_context.newValue))
      }
      if (changes.sidepanel_active_tab) {
        const nextTab = changes.sidepanel_active_tab.newValue
        if (nextTab === "resume" || nextTab === "cover-letter" || nextTab === "fill-form") {
          setActiveTab(nextTab)
        } else {
          setActiveTab("resume")
          void setStorage("sidepanel_active_tab", "resume")
        }
      }
    }

    chrome.storage.onChanged.addListener(handleStorageChange)
    return () => {
      mounted = false
      chrome.storage.onChanged.removeListener(handleStorageChange)
    }
  }, [])
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
      <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-gray-200">
        <BrandMark size="sm" />
        <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">
          Assistant
        </span>
      </div>
      <nav className="flex bg-white border-b border-gray-200">
        {tabs.map((tab) => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id)
                setStorage("sidepanel_active_tab", tab.id)
              }}
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
        {activeTab === "cover-letter" && <CoverLetter />}
      </main>
    </div>
  )
}

export default SidePanel
