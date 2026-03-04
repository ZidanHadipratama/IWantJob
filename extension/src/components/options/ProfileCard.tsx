import React, { useState, useEffect, useRef, useCallback } from "react"
import { getStorage, setStorage, type UserProfileConfig } from "~lib/storage"

const WORK_AUTH_OPTIONS = [
  { value: "", label: "Select..." },
  { value: "us_citizen", label: "US Citizen" },
  { value: "green_card", label: "Green Card" },
  { value: "h1b", label: "H1B" },
  { value: "opt", label: "OPT" },
  { value: "other", label: "Other" }
]

interface ProfileCardProps {
  onConfigChange?: (configured: boolean) => void
}

const EMPTY_PROFILE: UserProfileConfig = {
  name: "",
  email: "",
  linkedin_url: "",
  github_url: "",
  work_authorization: ""
}

export function ProfileCard({ onConfigChange }: ProfileCardProps) {
  const [profile, setProfile] = useState<UserProfileConfig>(EMPTY_PROFILE)
  const [savedIndicator, setSavedIndicator] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    getStorage("user_profile").then((stored) => {
      if (stored) {
        setProfile(stored)
        onConfigChange?.(!!(stored.name && stored.email))
      }
    })
  }, [onConfigChange])

  const save = useCallback(
    (updated: UserProfileConfig) => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(async () => {
        await setStorage("user_profile", updated)
        setSavedIndicator(true)
        setTimeout(() => setSavedIndicator(false), 1500)
        onConfigChange?.(!!(updated.name && updated.email))
      }, 500)
    },
    [onConfigChange]
  )

  function handleChange(field: keyof UserProfileConfig, value: string) {
    const updated = { ...profile, [field]: value }
    setProfile(updated)
    save(updated)
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-gray-800">Profile</h2>
        {savedIndicator && (
          <span className="text-xs text-green-600 font-medium">Saved</span>
        )}
      </div>

      <div className="space-y-4">
        {/* Name */}
        <div>
          <label
            htmlFor="profile-name"
            className="block text-sm font-medium text-gray-700 mb-1">
            Full Name
          </label>
          <input
            id="profile-name"
            type="text"
            value={profile.name}
            onChange={(e) => handleChange("name", e.target.value)}
            placeholder="Jane Doe"
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        {/* Email */}
        <div>
          <label
            htmlFor="profile-email"
            className="block text-sm font-medium text-gray-700 mb-1">
            Email
          </label>
          <input
            id="profile-email"
            type="email"
            value={profile.email}
            onChange={(e) => handleChange("email", e.target.value)}
            placeholder="jane@example.com"
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        {/* LinkedIn */}
        <div>
          <label
            htmlFor="profile-linkedin"
            className="block text-sm font-medium text-gray-700 mb-1">
            LinkedIn URL
          </label>
          <input
            id="profile-linkedin"
            type="url"
            value={profile.linkedin_url}
            onChange={(e) => handleChange("linkedin_url", e.target.value)}
            placeholder="https://linkedin.com/in/janedoe"
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        {/* GitHub */}
        <div>
          <label
            htmlFor="profile-github"
            className="block text-sm font-medium text-gray-700 mb-1">
            GitHub URL
          </label>
          <input
            id="profile-github"
            type="url"
            value={profile.github_url}
            onChange={(e) => handleChange("github_url", e.target.value)}
            placeholder="https://github.com/janedoe"
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        {/* Work Authorization */}
        <div>
          <label
            htmlFor="profile-work-auth"
            className="block text-sm font-medium text-gray-700 mb-1">
            Work Authorization
          </label>
          <select
            id="profile-work-auth"
            value={profile.work_authorization}
            onChange={(e) => handleChange("work_authorization", e.target.value)}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent">
            {WORK_AUTH_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  )
}
