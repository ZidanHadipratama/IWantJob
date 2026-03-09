import { useState, useEffect } from "react"
import { Settings, LayoutGrid } from "lucide-react"
import "./style.css"

import { SetupProgress } from "~components/options/SetupProgress"
import { BackendConfigCard } from "~components/options/BackendConfigCard"
import { SupabaseConfigCard } from "~components/options/SupabaseConfigCard"
import { AIConfigCard } from "~components/options/AIConfigCard"
import { ResumeUploadCard } from "~components/options/ResumeUploadCard"
import JobTracker from "~components/options/JobTracker"
import JobDetail from "~components/options/JobDetail"
import { getOrCreateUserId } from "~lib/storage"

type OptionsTab = "tracker" | "settings"

interface SectionState {
  backend: boolean
  database: boolean
  ai: boolean
  resume: boolean
}

function Options() {
  const [activeTab, setActiveTab] = useState<OptionsTab>("tracker")
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null)
  const [sections, setSections] = useState<SectionState>({
    backend: false,
    database: false,
    ai: false,
    resume: false
  })

  useEffect(() => {
    getOrCreateUserId()
  }, [])

  function updateSection(key: keyof SectionState) {
    return (configured: boolean) => {
      setSections((prev) => ({ ...prev, [key]: configured }))
    }
  }

  const setupSections = [
    { name: "Backend", configured: sections.backend },
    { name: "Database", configured: sections.database },
    { name: "AI Provider", configured: sections.ai },
    { name: "Resume", configured: sections.resume }
  ]

  const tabs = [
    { id: "tracker" as OptionsTab, label: "Tracker", icon: LayoutGrid },
    { id: "settings" as OptionsTab, label: "Settings", icon: Settings }
  ]

  return (
    <div className="min-h-screen bg-surface-secondary">
      {/* Top bar */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 flex items-center justify-between h-14">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">IW</span>
            </div>
            <h1 className="text-lg font-bold text-text">IWantJob</h1>
          </div>
          <nav className="flex gap-1">
            {tabs.map((tab) => {
              const Icon = tab.icon
              const isActive = activeTab === tab.id
              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    setActiveTab(tab.id)
                    if (tab.id !== "tracker") {
                      setSelectedJobId(null)
                    }
                  }}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                    isActive
                      ? "bg-primary-50 text-primary"
                      : "text-text-muted hover:text-text hover:bg-gray-100"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              )
            })}
          </nav>
        </div>
      </div>

      {/* Content */}
      <div className="py-8 px-6">
        {activeTab === "tracker" && (
          <div className="max-w-6xl mx-auto">
            <div className={selectedJobId ? "hidden" : ""}>
              <div className="mb-6">
                <h2 className="text-2xl font-bold text-text">Application Tracker</h2>
                <p className="text-sm text-text-muted mt-1">
                  Track and manage all your job applications in one place.
                </p>
              </div>
              <JobTracker onOpenJob={setSelectedJobId} />
            </div>
            {selectedJobId ? (
              <JobDetail jobId={selectedJobId} onBack={() => setSelectedJobId(null)} />
            ) : null}
          </div>
        )}

        {activeTab === "settings" && (
          <div className="max-w-2xl mx-auto">
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-text">Settings</h2>
              <p className="text-sm text-text-muted mt-1">
                Configure your API keys, database, and profile.
              </p>
            </div>

            <SetupProgress sections={setupSections} />

            <div className="space-y-4">
              <BackendConfigCard onConfigChange={updateSection("backend")} />
              <SupabaseConfigCard onConfigChange={updateSection("database")} />
              <AIConfigCard onConfigChange={updateSection("ai")} />
              <ResumeUploadCard onConfigChange={updateSection("resume")} />
            </div>

            <p className="text-center text-xs text-text-muted mt-8">
              IWantJob — open source, MIT license. All data stays in your Supabase DB.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

export default Options
