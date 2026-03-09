import { useState, useEffect, useMemo } from "react"
import {
  Search,
  ChevronDown,
  ChevronUp,
  Trash2,
  ExternalLink,
  Briefcase,
  MapPin,
  Building2,
  RefreshCw,
  X,
  Pencil,
  Check
} from "lucide-react"
import { createApiClient, type JobListItem } from "~lib/api"

type SortKey =
  | "company"
  | "title"
  | "status"
  | "job_type"
  | "employment_type"
  | "location"
  | "created_at"
type SortDir = "asc" | "desc"

const STATUS_OPTIONS = ["saved", "applied", "interviewing", "offer", "rejected", "withdrawn"]
const JOB_TYPE_OPTIONS = ["remote", "hybrid", "onsite", "unknown"]
const EMPLOYMENT_TYPE_OPTIONS = ["full-time", "part-time", "contract", "internship", "temporary", "freelance", "unknown"]

const STATUS_COLORS: Record<string, string> = {
  saved: "bg-gray-100 text-gray-700",
  applied: "bg-blue-100 text-blue-700",
  interviewing: "bg-amber-100 text-amber-700",
  offer: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
  withdrawn: "bg-gray-200 text-gray-500"
}

const JOB_TYPE_COLORS: Record<string, string> = {
  remote: "bg-purple-100 text-purple-700",
  hybrid: "bg-cyan-100 text-cyan-700",
  onsite: "bg-orange-100 text-orange-700",
  unknown: "bg-gray-100 text-gray-500"
}

const EMPLOYMENT_TYPE_COLORS: Record<string, string> = {
  "full-time": "bg-emerald-100 text-emerald-700",
  "part-time": "bg-lime-100 text-lime-700",
  contract: "bg-amber-100 text-amber-700",
  internship: "bg-sky-100 text-sky-700",
  temporary: "bg-rose-100 text-rose-700",
  freelance: "bg-indigo-100 text-indigo-700",
  unknown: "bg-gray-100 text-gray-500"
}

interface JobTrackerProps {
  onOpenJob?: (jobId: string) => void
}

function StatusBadge({ status }: { status: string }) {
  const color = STATUS_COLORS[status] || STATUS_COLORS.saved
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${color}`}>
      {status}
    </span>
  )
}

function JobTypeBadge({ jobType }: { jobType: string }) {
  const type = jobType || "unknown"
  const color = JOB_TYPE_COLORS[type] || JOB_TYPE_COLORS.unknown
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${color}`}>
      {type}
    </span>
  )
}

function EmploymentTypeBadge({ employmentType }: { employmentType: string }) {
  const type = employmentType || "unknown"
  const color = EMPLOYMENT_TYPE_COLORS[type] || EMPLOYMENT_TYPE_COLORS.unknown
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${color}`}>
      {type}
    </span>
  )
}

/** Inline edit dropdown for tracker enum fields. */
function InlineSelect({
  value,
  options,
  onSave,
  onCancel,
}: {
  value: string
  options: string[]
  onSave: (val: string) => void
  onCancel: () => void
}) {
  const [selected, setSelected] = useState(value)

  return (
    <div className="flex items-center gap-1" onClick={(event) => event.stopPropagation()}>
      <select
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
        className="text-xs border border-gray-300 rounded px-1 py-0.5 bg-white focus:outline-none focus:ring-1 focus:ring-primary"
        autoFocus
      >
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
      <button onClick={() => onSave(selected)} className="text-green-600 hover:text-green-800 cursor-pointer">
        <Check className="w-3.5 h-3.5" />
      </button>
      <button onClick={onCancel} className="text-gray-400 hover:text-gray-600 cursor-pointer">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}

function stopAndRun(action: () => void) {
  return (event: { stopPropagation: () => void }) => {
    event.stopPropagation()
    action()
  }
}

export default function JobTracker({ onOpenJob }: JobTrackerProps) {
  const [jobs, setJobs] = useState<JobListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [filterStatus, setFilterStatus] = useState<string>("all")
  const [filterType, setFilterType] = useState<string>("all")
  const [sortKey, setSortKey] = useState<SortKey>("created_at")
  const [sortDir, setSortDir] = useState<SortDir>("desc")
  const [editingCell, setEditingCell] = useState<{ jobId: string; field: "status" | "job_type" | "employment_type" } | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  function stopRowAction(event: { stopPropagation: () => void }) {
    event.stopPropagation()
  }

  async function fetchJobs() {
    setLoading(true)
    setError(null)
    try {
      const client = await createApiClient()
      const data = await client.getJobs()
      setJobs(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load jobs")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchJobs()
  }, [])

  async function handleUpdateField(jobId: string, field: "status" | "job_type" | "employment_type", value: string) {
    const job = jobs.find((j) => j.id === jobId)
    if (!job) return
    try {
      const client = await createApiClient()
      await client.logJob({
        job_id: jobId,
        company: job.company,
        title: job.title,
        [field]: value
      })
      setJobs((prev) => prev.map((j) => (j.id === jobId ? { ...j, [field]: value } : j)))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update")
    }
    setEditingCell(null)
  }

  async function handleDelete(jobId: string) {
    try {
      const client = await createApiClient()
      await client.deleteJob(jobId)
      setJobs((prev) => prev.filter((j) => j.id !== jobId))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete job")
    }
    setDeleteConfirm(null)
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    } else {
      setSortKey(key)
      setSortDir("asc")
    }
  }

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ChevronDown className="w-3 h-3 opacity-30" />
    return sortDir === "asc" ? (
      <ChevronUp className="w-3 h-3" />
    ) : (
      <ChevronDown className="w-3 h-3" />
    )
  }

  const filtered = useMemo(() => {
    let result = [...jobs]

    // Search
    if (search) {
      const q = search.toLowerCase()
      result = result.filter(
        (j) =>
          j.company.toLowerCase().includes(q) ||
          j.title.toLowerCase().includes(q) ||
          (j.location || "").toLowerCase().includes(q)
      )
    }

    // Filter by status
    if (filterStatus !== "all") {
      result = result.filter((j) => j.status === filterStatus)
    }

    // Filter by job type
    if (filterType !== "all") {
      result = result.filter((j) => (j.job_type || "unknown") === filterType)
    }

    // Sort
    result.sort((a, b) => {
      const aVal = (a[sortKey] || "").toString().toLowerCase()
      const bVal = (b[sortKey] || "").toString().toLowerCase()
      const cmp = aVal.localeCompare(bVal)
      return sortDir === "asc" ? cmp : -cmp
    })

    return result
  }, [jobs, search, filterStatus, filterType, sortKey, sortDir])

  // Stats
  const stats = useMemo(() => {
    const total = jobs.length
    const applied = jobs.filter((j) => j.status === "applied").length
    const interviewing = jobs.filter((j) => j.status === "interviewing").length
    const offers = jobs.filter((j) => j.status === "offer").length
    return { total, applied, interviewing, offers }
  }, [jobs])

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
      {filtered.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-16 text-center">
          <Briefcase className="w-10 h-10 text-text-muted opacity-40 mb-3" />
          <p className="text-sm text-text-muted">
            {jobs.length === 0
              ? "No applications yet. Start by tailoring a resume or filling a form."
              : "No jobs match your filters."}
          </p>
        </div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  {([
                    ["company", "Company"],
                    ["title", "Title"],
                    ["status", "Status"],
                    ["job_type", "Work Mode"],
                    ["employment_type", "Employment"],
                    ["location", "Location"],
                    ["created_at", "Date Added"]
                  ] as [SortKey, string][]).map(([key, label]) => (
                    <th
                      key={key}
                      onClick={() => toggleSort(key)}
                      className="px-4 py-3 text-left text-xs font-semibold text-text-secondary cursor-pointer hover:text-text select-none"
                    >
                      <span className="inline-flex items-center gap-1">
                        {label}
                        <SortIcon col={key} />
                      </span>
                    </th>
                  ))}
                  <th className="px-4 py-3 text-right text-xs font-semibold text-text-secondary w-20">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((job) => (
                  <tr
                    key={job.id}
                    onClick={() => onOpenJob?.(job.id)}
                    onKeyDown={(event) => {
                      if (!onOpenJob) return
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault()
                        onOpenJob(job.id)
                      }
                    }}
                    tabIndex={onOpenJob ? 0 : undefined}
                    className={`border-b border-gray-100 hover:bg-primary-50/30 transition-colors ${
                      onOpenJob ? "cursor-pointer focus:outline-none focus:bg-primary-50/40" : ""
                    }`}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-text-muted shrink-0" />
                        <span className="font-medium text-text">{job.company}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-text">{job.title}</span>
                        {job.url && (
                          <a
                            href={job.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={stopRowAction}
                            className="text-primary hover:text-primary-dark"
                            title="Open job posting"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {editingCell?.jobId === job.id && editingCell.field === "status" ? (
                        <InlineSelect
                          value={job.status}
                          options={STATUS_OPTIONS}
                          onSave={(val) => handleUpdateField(job.id, "status", val)}
                          onCancel={() => setEditingCell(null)}
                        />
                      ) : (
                        <button
                          onClick={stopAndRun(() => setEditingCell({ jobId: job.id, field: "status" }))}
                          className="group inline-flex items-center gap-1 cursor-pointer"
                          title="Click to change status"
                        >
                          <StatusBadge status={job.status} />
                          <Pencil className="w-3 h-3 text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {editingCell?.jobId === job.id && editingCell.field === "job_type" ? (
                        <InlineSelect
                          value={job.job_type || "unknown"}
                          options={JOB_TYPE_OPTIONS}
                          onSave={(val) => handleUpdateField(job.id, "job_type", val)}
                          onCancel={() => setEditingCell(null)}
                        />
                      ) : (
                        <button
                          onClick={stopAndRun(() => setEditingCell({ jobId: job.id, field: "job_type" }))}
                          className="group inline-flex items-center gap-1 cursor-pointer"
                          title="Click to change type"
                        >
                          <JobTypeBadge jobType={job.job_type || "unknown"} />
                          <Pencil className="w-3 h-3 text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {editingCell?.jobId === job.id && editingCell.field === "employment_type" ? (
                        <InlineSelect
                          value={job.employment_type || "unknown"}
                          options={EMPLOYMENT_TYPE_OPTIONS}
                          onSave={(val) => handleUpdateField(job.id, "employment_type", val)}
                          onCancel={() => setEditingCell(null)}
                        />
                      ) : (
                        <button
                          onClick={stopAndRun(() => setEditingCell({ jobId: job.id, field: "employment_type" }))}
                          className="group inline-flex items-center gap-1 cursor-pointer"
                          title="Click to change employment type"
                        >
                          <EmploymentTypeBadge employmentType={job.employment_type || "unknown"} />
                          <Pencil className="w-3 h-3 text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 text-text-secondary">
                        {job.location ? (
                          <>
                            <MapPin className="w-3.5 h-3.5 text-text-muted shrink-0" />
                            <span className="truncate max-w-[150px]">{job.location}</span>
                          </>
                        ) : (
                          <span className="text-text-muted">--</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-text-muted text-xs">
                      {new Date(job.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {deleteConfirm === job.id ? (
                        <div className="inline-flex items-center gap-1">
                          <button
                            onClick={stopAndRun(() => handleDelete(job.id))}
                            className="text-xs text-red-600 hover:text-red-800 font-medium cursor-pointer"
                          >
                            Confirm
                          </button>
                          <button
                            onClick={stopAndRun(() => setDeleteConfirm(null))}
                            className="text-xs text-gray-400 hover:text-gray-600 cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={stopAndRun(() => setDeleteConfirm(job.id))}
                          className="text-gray-400 hover:text-red-500 transition-colors cursor-pointer"
                          title="Delete job"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="text-xs text-text-muted mt-3 text-right">
        {filtered.length} of {jobs.length} job{jobs.length !== 1 ? "s" : ""}
      </p>
    </div>
  )
}
