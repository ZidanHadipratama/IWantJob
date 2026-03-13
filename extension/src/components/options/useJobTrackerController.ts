import { useCallback, useEffect, useMemo, useState } from "react"

import { createApiClient, type JobListItem } from "~lib/api"

export type SortKey =
  | "company"
  | "title"
  | "status"
  | "job_type"
  | "employment_type"
  | "location"
  | "created_at"

export type SortDir = "asc" | "desc"

export type EditableTrackerField = "status" | "job_type" | "employment_type"

export interface EditingCell {
  jobId: string
  field: EditableTrackerField
}

export const STATUS_OPTIONS = ["saved", "applied", "interviewing", "offer", "rejected", "withdrawn"]
export const JOB_TYPE_OPTIONS = ["remote", "hybrid", "onsite", "unknown"]
export const EMPLOYMENT_TYPE_OPTIONS = ["full-time", "part-time", "contract", "internship", "temporary", "freelance", "unknown"]

export interface JobTrackerController {
  jobs: JobListItem[]
  loading: boolean
  error: string | null
  search: string
  filterStatus: string
  filterType: string
  sortKey: SortKey
  sortDir: SortDir
  editingCell: EditingCell | null
  deleteConfirm: string | null
  filteredJobs: JobListItem[]
  stats: {
    total: number
    applied: number
    interviewing: number
    offers: number
  }
  setSearch: (value: string) => void
  setFilterStatus: (value: string) => void
  setFilterType: (value: string) => void
  setEditingCell: (value: EditingCell | null) => void
  setDeleteConfirm: (value: string | null) => void
  fetchJobs: () => Promise<void>
  handleUpdateField: (jobId: string, field: EditableTrackerField, value: string) => Promise<void>
  handleDelete: (jobId: string) => Promise<void>
  toggleSort: (key: SortKey) => void
}

export function useJobTrackerController(): JobTrackerController {
  const [jobs, setJobs] = useState<JobListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [filterStatus, setFilterStatus] = useState<string>("all")
  const [filterType, setFilterType] = useState<string>("all")
  const [sortKey, setSortKey] = useState<SortKey>("created_at")
  const [sortDir, setSortDir] = useState<SortDir>("desc")
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  const fetchJobs = useCallback(async () => {
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
  }, [])

  useEffect(() => {
    void fetchJobs()
  }, [fetchJobs])

  const handleUpdateField = useCallback(async (jobId: string, field: EditableTrackerField, value: string) => {
    const job = jobs.find((item) => item.id === jobId)
    if (!job) return

    try {
      const client = await createApiClient()
      await client.logJob({
        job_id: jobId,
        company: job.company,
        title: job.title,
        [field]: value
      })
      setJobs((previous) => previous.map((item) => (item.id === jobId ? { ...item, [field]: value } : item)))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update")
    }

    setEditingCell(null)
  }, [jobs])

  const handleDelete = useCallback(async (jobId: string) => {
    try {
      const client = await createApiClient()
      await client.deleteJob(jobId)
      setJobs((previous) => previous.filter((item) => item.id !== jobId))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete job")
    }

    setDeleteConfirm(null)
  }, [])

  const toggleSort = useCallback((key: SortKey) => {
    if (sortKey === key) {
      setSortDir((direction) => (direction === "asc" ? "desc" : "asc"))
      return
    }

    setSortKey(key)
    setSortDir("asc")
  }, [sortKey])

  const filteredJobs = useMemo(() => {
    let result = [...jobs]

    if (search) {
      const query = search.toLowerCase()
      result = result.filter(
        (job) =>
          job.company.toLowerCase().includes(query) ||
          job.title.toLowerCase().includes(query) ||
          (job.location || "").toLowerCase().includes(query)
      )
    }

    if (filterStatus !== "all") {
      result = result.filter((job) => job.status === filterStatus)
    }

    if (filterType !== "all") {
      result = result.filter((job) => (job.job_type || "unknown") === filterType)
    }

    result.sort((left, right) => {
      const leftValue = (left[sortKey] || "").toString().toLowerCase()
      const rightValue = (right[sortKey] || "").toString().toLowerCase()
      const comparison = leftValue.localeCompare(rightValue)
      return sortDir === "asc" ? comparison : -comparison
    })

    return result
  }, [jobs, search, filterStatus, filterType, sortKey, sortDir])

  const stats = useMemo(() => ({
    total: jobs.length,
    applied: jobs.filter((job) => job.status === "applied").length,
    interviewing: jobs.filter((job) => job.status === "interviewing").length,
    offers: jobs.filter((job) => job.status === "offer").length
  }), [jobs])

  return {
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
  }
}
