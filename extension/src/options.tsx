import React, { useState, useEffect } from "react"
import "./style.css"

import { SetupProgress } from "~components/options/SetupProgress"
import { BackendConfigCard } from "~components/options/BackendConfigCard"
import { SupabaseConfigCard } from "~components/options/SupabaseConfigCard"
import { AIConfigCard } from "~components/options/AIConfigCard"
import { ResumeUploadCard } from "~components/options/ResumeUploadCard"
import { ProfileCard } from "~components/options/ProfileCard"
import { getOrCreateUserId } from "~lib/storage"

interface SectionState {
  backend: boolean
  database: boolean
  ai: boolean
  resume: boolean
  profile: boolean
}

function Options() {
  const [sections, setSections] = useState<SectionState>({
    backend: false,
    database: false,
    ai: false,
    resume: false,
    profile: false
  })

  // Ensure user_id is created on first load
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
    { name: "Resume", configured: sections.resume },
    { name: "Profile", configured: sections.profile }
  ]

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">IWantJob Settings</h1>
          <p className="text-sm text-gray-500 mt-1">
            Configure your API keys, database, and profile to get started.
          </p>
        </div>

        {/* Setup Progress */}
        <SetupProgress sections={setupSections} />

        {/* Config Cards */}
        <div className="space-y-4">
          <BackendConfigCard onConfigChange={updateSection("backend")} />
          <SupabaseConfigCard onConfigChange={updateSection("database")} />
          <AIConfigCard onConfigChange={updateSection("ai")} />
          <ResumeUploadCard onConfigChange={updateSection("resume")} />
          <ProfileCard onConfigChange={updateSection("profile")} />
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-gray-400 mt-8">
          IWantJob — open source, MIT license. All data stays in your Supabase DB.
        </p>
      </div>
    </div>
  )
}

export default Options
