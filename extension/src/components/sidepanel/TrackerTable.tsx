import { LayoutGrid, ExternalLink } from "lucide-react"

export default function TrackerTable() {
  function openTracker() {
    chrome.runtime.openOptionsPage()
  }

  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-12 h-12 rounded-xl bg-primary-50 flex items-center justify-center mb-4">
        <LayoutGrid className="w-6 h-6 text-primary" />
      </div>
      <h2 className="text-lg font-semibold text-text mb-2">Application Tracker</h2>
      <p className="text-sm text-text-muted max-w-[280px] mb-6">
        Track all your job applications in the full-size tracker view.
      </p>
      <button onClick={openTracker} className="btn-primary">
        <ExternalLink className="w-4 h-4" />
        Open Tracker
      </button>
    </div>
  )
}
