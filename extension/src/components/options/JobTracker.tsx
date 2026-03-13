import { Briefcase, RefreshCw, Search } from "lucide-react"

interface JobTrackerProps {
  onOpenJob?: (jobId: string) => void
}
import { TrackerTable } from "./TrackerTable"
import {
  JOB_TYPE_OPTIONS,
  STATUS_OPTIONS,
  useJobTrackerController
} from "./useJobTrackerController"

export default function JobTracker({ onOpenJob }: JobTrackerProps) {
  const {
    jobs,
    loading,
    error,
    search,
    filterStatus,
    filterType,
    sortKey,
    sortDir,
    editingCell,
    deleteConfirm,
    filteredJobs,
    stats,
    setSearch,
    setFilterStatus,
    setFilterType,
    setEditingCell,
    setDeleteConfirm,
    fetchJobs,
    handleUpdateField,
    handleDelete,
    toggleSort
  } = useJobTrackerController()

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <RefreshCw className="w-5 h-5 animate-spin text-primary mr-2" />
        <span className="text-sm text-text-muted">Loading applications...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-sm text-red-600 mb-3">{error}</p>
        <button onClick={fetchJobs} className="btn-secondary text-sm">
          Retry
        </button>
      </div>
    )
  }

  return (
    <div>
      {/* Stats row */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          { label: "Total", value: stats.total, color: "text-text" },
          { label: "Applied", value: stats.applied, color: "text-blue-600" },
          { label: "Interviewing", value: stats.interviewing, color: "text-amber-600" },
          { label: "Offers", value: stats.offers, color: "text-green-600" }
        ].map((s) => (
          <div key={s.label} className="card text-center py-4">
            <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
            <div className="text-xs text-text-muted mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Search + Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
          <input
            type="text"
            placeholder="Search company, title, or location..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input-field pl-9"
          />
        </div>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="input-field w-auto"
        >
          <option value="all">All Statuses</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </option>
          ))}
        </select>
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="input-field w-auto"
        >
          <option value="all">All Work Modes</option>
          {JOB_TYPE_OPTIONS.map((t) => (
            <option key={t} value={t}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </option>
          ))}
        </select>
        <button onClick={fetchJobs} className="btn-secondary" title="Refresh">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Table */}
      {filteredJobs.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-16 text-center">
          <Briefcase className="w-10 h-10 text-text-muted opacity-40 mb-3" />
          <p className="text-sm text-text-muted">
            {jobs.length === 0
              ? "No applications yet. Start by tailoring a resume or filling a form."
              : "No jobs match your filters."}
          </p>
        </div>
      ) : (
        <TrackerTable
          jobs={filteredJobs}
          sortKey={sortKey}
          sortDir={sortDir}
          editingCell={editingCell}
          deleteConfirm={deleteConfirm}
          onToggleSort={toggleSort}
          onSetEditingCell={setEditingCell}
          onSetDeleteConfirm={setDeleteConfirm}
          onUpdateField={handleUpdateField}
          onDelete={handleDelete}
          onOpenJob={onOpenJob}
        />
      )}

      <p className="text-xs text-text-muted mt-3 text-right">
        {filteredJobs.length} of {jobs.length} job{jobs.length !== 1 ? "s" : ""}
      </p>
    </div>
  )
}
