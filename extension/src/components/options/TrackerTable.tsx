import { useState } from "react"
import {
  Building2,
  Check,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  FolderOpen,
  MapPin,
  Pencil,
  Trash2,
  X
} from "lucide-react"

import type { JobListItem } from "~lib/api"

import {
  EMPLOYMENT_TYPE_OPTIONS,
  JOB_TYPE_OPTIONS,
  STATUS_OPTIONS,
  type EditingCell,
  type EditableTrackerField,
  type SortDir,
  type SortKey
} from "./useJobTrackerController"

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

const SORTABLE_COLUMNS: [SortKey, string][] = [
  ["company", "Company"],
  ["title", "Title"],
  ["status", "Status"],
  ["job_type", "Work Mode"],
  ["employment_type", "Employment"],
  ["location", "Location"],
  ["created_at", "Date Added"]
]

interface TrackerTableProps {
  jobs: JobListItem[]
  sortKey: SortKey
  sortDir: SortDir
  editingCell: EditingCell | null
  deleteConfirm: string | null
  onToggleSort: (key: SortKey) => void
  onSetEditingCell: (value: EditingCell | null) => void
  onSetDeleteConfirm: (value: string | null) => void
  onUpdateField: (jobId: string, field: EditableTrackerField, value: string) => Promise<void>
  onDelete: (jobId: string) => Promise<void>
  onOpenJob?: (jobId: string) => void
}

function StatusBadge({ status }: { status: string }) {
  const color = STATUS_COLORS[status] || STATUS_COLORS.saved
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${color}`}>
      {status}
    </span>
  )
}

function JobTypeBadge({ jobType }: { jobType: string }) {
  const type = jobType || "unknown"
  const color = JOB_TYPE_COLORS[type] || JOB_TYPE_COLORS.unknown
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${color}`}>
      {type}
    </span>
  )
}

function EmploymentTypeBadge({ employmentType }: { employmentType: string }) {
  const type = employmentType || "unknown"
  const color = EMPLOYMENT_TYPE_COLORS[type] || EMPLOYMENT_TYPE_COLORS.unknown
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${color}`}>
      {type}
    </span>
  )
}

function InlineSelect({
  value,
  options,
  onSave,
  onCancel
}: {
  value: string
  options: string[]
  onSave: (value: string) => void
  onCancel: () => void
}) {
  const [selected, setSelected] = useState(value)

  return (
    <div className="flex items-center gap-1" onClick={(event) => event.stopPropagation()}>
      <select
        value={selected}
        onChange={(event) => setSelected(event.target.value)}
        className="rounded border border-gray-300 bg-white px-1 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
        autoFocus
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      <button onClick={() => onSave(selected)} className="cursor-pointer text-green-600 hover:text-green-800">
        <Check className="h-3.5 w-3.5" />
      </button>
      <button onClick={onCancel} className="cursor-pointer text-gray-400 hover:text-gray-600">
        <X className="h-3.5 w-3.5" />
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

function SortIcon({ activeKey, activeDir, column }: { activeKey: SortKey; activeDir: SortDir; column: SortKey }) {
  if (activeKey !== column) return <ChevronDown className="h-3 w-3 opacity-30" />
  return activeDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
}

export function TrackerTable({
  jobs,
  sortKey,
  sortDir,
  editingCell,
  deleteConfirm,
  onToggleSort,
  onSetEditingCell,
  onSetDeleteConfirm,
  onUpdateField,
  onDelete,
  onOpenJob
}: TrackerTableProps) {
  return (
    <div className="card overflow-hidden p-0">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              {SORTABLE_COLUMNS.map(([key, label]) => (
                <th
                  key={key}
                  onClick={() => onToggleSort(key)}
                  className="cursor-pointer select-none px-4 py-3 text-left text-xs font-semibold text-text-secondary hover:text-text"
                >
                  <span className="inline-flex items-center gap-1">
                    {label}
                    <SortIcon activeKey={sortKey} activeDir={sortDir} column={key} />
                  </span>
                </th>
              ))}
              <th className="w-44 px-4 py-3 text-right text-xs font-semibold text-text-secondary">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((job) => (
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
                className={`border-b border-gray-100 transition-colors hover:bg-primary-50/30 ${
                  onOpenJob ? "cursor-pointer focus:bg-primary-50/40 focus:outline-none" : ""
                }`}
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 shrink-0 text-text-muted" />
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
                        onClick={(event) => event.stopPropagation()}
                        className="text-primary hover:text-primary-dark"
                        title="Open job posting"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3">
                  {editingCell?.jobId === job.id && editingCell.field === "status" ? (
                    <InlineSelect
                      value={job.status}
                      options={STATUS_OPTIONS}
                      onSave={(value) => onUpdateField(job.id, "status", value)}
                      onCancel={() => onSetEditingCell(null)}
                    />
                  ) : (
                    <button
                      onClick={stopAndRun(() => onSetEditingCell({ jobId: job.id, field: "status" }))}
                      className="group inline-flex cursor-pointer items-center gap-1"
                      title="Click to change status"
                    >
                      <StatusBadge status={job.status} />
                      <Pencil className="h-3 w-3 text-gray-300 opacity-0 transition-opacity group-hover:opacity-100" />
                    </button>
                  )}
                </td>
                <td className="px-4 py-3">
                  {editingCell?.jobId === job.id && editingCell.field === "job_type" ? (
                    <InlineSelect
                      value={job.job_type || "unknown"}
                      options={JOB_TYPE_OPTIONS}
                      onSave={(value) => onUpdateField(job.id, "job_type", value)}
                      onCancel={() => onSetEditingCell(null)}
                    />
                  ) : (
                    <button
                      onClick={stopAndRun(() => onSetEditingCell({ jobId: job.id, field: "job_type" }))}
                      className="group inline-flex cursor-pointer items-center gap-1"
                      title="Click to change type"
                    >
                      <JobTypeBadge jobType={job.job_type || "unknown"} />
                      <Pencil className="h-3 w-3 text-gray-300 opacity-0 transition-opacity group-hover:opacity-100" />
                    </button>
                  )}
                </td>
                <td className="px-4 py-3">
                  {editingCell?.jobId === job.id && editingCell.field === "employment_type" ? (
                    <InlineSelect
                      value={job.employment_type || "unknown"}
                      options={EMPLOYMENT_TYPE_OPTIONS}
                      onSave={(value) => onUpdateField(job.id, "employment_type", value)}
                      onCancel={() => onSetEditingCell(null)}
                    />
                  ) : (
                    <button
                      onClick={stopAndRun(() => onSetEditingCell({ jobId: job.id, field: "employment_type" }))}
                      className="group inline-flex cursor-pointer items-center gap-1"
                      title="Click to change employment type"
                    >
                      <EmploymentTypeBadge employmentType={job.employment_type || "unknown"} />
                      <Pencil className="h-3 w-3 text-gray-300 opacity-0 transition-opacity group-hover:opacity-100" />
                    </button>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1 text-text-secondary">
                    {job.location ? (
                      <>
                        <MapPin className="h-3.5 w-3.5 shrink-0 text-text-muted" />
                        <span className="max-w-[150px] truncate">{job.location}</span>
                      </>
                    ) : (
                      <span className="text-text-muted">--</span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 text-xs text-text-muted">
                  {new Date(job.created_at).toLocaleDateString()}
                </td>
                <td className="px-4 py-3 text-right">
                  {deleteConfirm === job.id ? (
                    <div className="inline-flex items-center gap-2">
                      <button
                        onClick={stopAndRun(() => void onDelete(job.id))}
                        className="cursor-pointer rounded-md border border-red-200 px-2 py-1 text-xs font-medium text-red-600 transition-colors hover:border-red-300 hover:text-red-800"
                      >
                        Confirm
                      </button>
                      <button
                        onClick={stopAndRun(() => onSetDeleteConfirm(null))}
                        className="cursor-pointer rounded-md border border-gray-200 px-2 py-1 text-xs font-medium text-gray-500 transition-colors hover:border-gray-300 hover:text-gray-700"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="inline-flex items-center justify-end gap-2">
                      <button
                        onClick={stopAndRun(() => onOpenJob?.(job.id))}
                        disabled={!onOpenJob}
                        className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium transition-colors ${
                          onOpenJob
                            ? "cursor-pointer border-gray-200 text-text-secondary hover:border-primary-200 hover:text-primary"
                            : "cursor-not-allowed border-gray-100 text-gray-300"
                        }`}
                        title="Open job details"
                      >
                        <FolderOpen className="h-3.5 w-3.5" />
                        Open
                      </button>
                      <button
                        onClick={stopAndRun(() => onSetDeleteConfirm(job.id))}
                        className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-xs font-medium text-gray-500 transition-colors hover:border-red-200 hover:text-red-600"
                        title="Delete job"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Delete
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
