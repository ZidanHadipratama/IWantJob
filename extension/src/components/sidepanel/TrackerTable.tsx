import { LayoutGrid, Briefcase } from "lucide-react"

export default function TrackerTable() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-12 h-12 rounded-xl bg-primary-50 flex items-center justify-center mb-4">
        <LayoutGrid className="w-6 h-6 text-primary" />
      </div>
      <h2 className="text-lg font-semibold text-text mb-2">Application Tracker</h2>
      <p className="text-sm text-text-muted max-w-[280px]">
        Your job applications will appear here. Start by tailoring a resume or filling a form to log your first job.
      </p>

      {/* Empty state table preview */}
      <div className="w-full mt-6 card p-0 overflow-hidden">
        <div className="grid grid-cols-3 gap-px bg-gray-100">
          <div className="bg-white px-3 py-2 text-xs font-semibold text-text-secondary">Company</div>
          <div className="bg-white px-3 py-2 text-xs font-semibold text-text-secondary">Title</div>
          <div className="bg-white px-3 py-2 text-xs font-semibold text-text-secondary">Status</div>
        </div>
        <div className="flex items-center justify-center py-8 text-text-muted">
          <Briefcase className="w-5 h-5 mr-2 opacity-40" />
          <span className="text-sm">No applications yet</span>
        </div>
      </div>
    </div>
  )
}
