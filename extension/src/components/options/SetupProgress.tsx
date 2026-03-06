import { CheckCircle, Circle } from "lucide-react"

interface Section {
  name: string
  configured: boolean
}

interface SetupProgressProps {
  sections: Section[]
}

export function SetupProgress({ sections }: SetupProgressProps) {
  const configuredCount = sections.filter((s) => s.configured).length
  const total = sections.length
  const percent = total > 0 ? Math.round((configuredCount / total) * 100) : 0

  return (
    <div className="card p-4 mb-6">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold text-text">
          Setup Progress
        </span>
        <span className="text-sm font-medium text-text-muted">
          {configuredCount}/{total} complete
        </span>
      </div>

      <div className="w-full bg-gray-100 rounded-full h-2 mb-3">
        <div
          className="bg-primary h-2 rounded-full transition-all duration-500"
          style={{ width: `${percent}%` }}
        />
      </div>

      <div className="flex flex-wrap gap-3">
        {sections.map((section) => (
          <div key={section.name} className="flex items-center gap-1.5">
            {section.configured ? (
              <CheckCircle className="w-4 h-4 text-primary" />
            ) : (
              <Circle className="w-4 h-4 text-gray-300" />
            )}
            <span
              className={`text-xs font-medium ${
                section.configured ? "text-primary-700" : "text-text-muted"
              }`}>
              {section.name}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
