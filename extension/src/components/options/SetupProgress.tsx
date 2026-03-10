import { AlertCircle, CheckCircle, Circle } from "lucide-react"

export type SetupStatus = "missing" | "configured" | "healthy" | "error"

export interface Section {
  name: string
  status: SetupStatus
}

interface SetupProgressProps {
  sections: Section[]
}

export function SetupProgress({ sections }: SetupProgressProps) {
  const healthyCount = sections.filter((s) => s.status === "healthy").length
  const configuredCount = sections.filter((s) => s.status === "configured").length
  const errorCount = sections.filter((s) => s.status === "error").length
  const total = sections.length
  const percent = total > 0 ? Math.round((healthyCount / total) * 100) : 0

  function renderStatus(status: SetupStatus) {
    if (status === "healthy") {
      return {
        icon: <CheckCircle className="w-4 h-4 text-primary" />,
        label: "Healthy",
        tone: "text-primary-700"
      }
    }
    if (status === "configured") {
      return {
        icon: <Circle className="w-4 h-4 text-amber-500 fill-amber-500/15" />,
        label: "Configured",
        tone: "text-amber-700"
      }
    }
    if (status === "error") {
      return {
        icon: <AlertCircle className="w-4 h-4 text-red-500" />,
        label: "Error",
        tone: "text-red-700"
      }
    }
    return {
      icon: <Circle className="w-4 h-4 text-gray-300" />,
      label: "Missing",
      tone: "text-text-muted"
    }
  }

  return (
    <div className="card p-4 mb-6">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold text-text">
          Setup Progress
        </span>
        <span className="text-sm font-medium text-text-muted">
          {healthyCount}/{total} healthy
        </span>
      </div>

      <div className="w-full bg-gray-100 rounded-full h-2 mb-3">
        <div
          className="bg-primary h-2 rounded-full transition-all duration-500"
          style={{ width: `${percent}%` }}
        />
      </div>

      <div className="mb-3 flex flex-wrap gap-3 text-[11px] font-medium">
        <span className="text-primary-700">{healthyCount} healthy</span>
        <span className="text-amber-700">{configuredCount} configured</span>
        <span className="text-red-700">{errorCount} errors</span>
      </div>

      <div className="flex flex-wrap gap-3">
        {sections.map((section) => {
          const status = renderStatus(section.status)
          return (
            <div key={section.name} className="flex items-center gap-1.5">
              {status.icon}
              <span className="text-xs font-medium text-text">{section.name}</span>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${status.tone} bg-white/70`}>
                {status.label}
              </span>
            </div>
          )
        })}
      </div>

      <p className="mt-3 text-xs text-text-muted">
        Saved configuration does not count as healthy until you run the live check for that service.
      </p>
    </div>
  )
}
