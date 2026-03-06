import { useState, useEffect } from "react"
import "./style.css"

import { SetupProgress } from "~components/options/SetupProgress"
import { BackendConfigCard } from "~components/options/BackendConfigCard"
import { SupabaseConfigCard } from "~components/options/SupabaseConfigCard"
import { AIConfigCard } from "~components/options/AIConfigCard"
import { ResumeUploadCard } from "~components/options/ResumeUploadCard"
import { getOrCreateUserId } from "~lib/storage"

interface SectionState {
  backend: boolean
  database: boolean
  ai: boolean
  resume: boolean
}

function Options() {
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

  return (
    <div className="min-h-screen bg-surface-secondary py-8 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-6 flex items-center gap-3">
          <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center">
            <span className="text-white font-bold text-lg">IW</span>
          </div>
          <div>
            <h1 className="text-2xl font-bold text-text">IWantJob Settings</h1>
            <p className="text-sm text-text-muted">
              Configure your API keys, database, and profile to get started.
            </p>
          </div>
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
    </div>
  )
}

export default Options
