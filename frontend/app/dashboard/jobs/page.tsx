'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { 
  FileText, 
  CheckCircle2, 
  Clock, 
  AlertCircle,
  Search,
  Download,
  Eye,
  RefreshCw
} from 'lucide-react'
import { supabase, Job } from '@/lib/supabase'

type StatusFilter = 'all' | 'queued' | 'processing' | 'complete' | 'flagged' | 'error'

const statusTabs: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'queued', label: 'Queued' },
  { value: 'processing', label: 'Processing' },
  { value: 'complete', label: 'Complete' },
  { value: 'flagged', label: 'Flagged' },
  { value: 'error', label: 'Error' },
]

function SkeletonRow() {
  return (
    <div className="animate-shimmer h-14 rounded-lg" />
  )
}

export default function JobsPage() {
  const searchParams = useSearchParams()
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(
    (searchParams.get('status') as StatusFilter) || 'all'
  )
  const [searchQuery, setSearchQuery] = useState('')
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    loadJobs()
    
    // Auto-refresh every 8 seconds
    const refreshInterval = setInterval(() => {
      if (!refreshing) {
        loadJobs(true)
      }
    }, 8000)

    return () => clearInterval(refreshInterval)
  }, [statusFilter])

  async function loadJobs(silent = false) {
    if (!silent) setLoading(true)
    if (silent) setRefreshing(true)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      let query = supabase
        .from('jobs')
        .select('*')
        .eq('client_id', user.id)
        .order('created_at', { ascending: false })

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter)
      }

      if (searchQuery) {
        query = query.ilike('filename', `%${searchQuery}%`)
      }

      const { data } = await query

      if (data) {
        setJobs(data)
      }
    } catch (error) {
      console.error('Error loading jobs:', error)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    loadJobs()
  }

  const downloadExcel = async (job: Job) => {
    const { data: result } = await supabase
      .from('extraction_results')
      .select('*')
      .eq('job_id', job.id)
      .single()

    if (result) {
      // Create Excel-like CSV format
      const fields = Object.keys(result.data)
      const rows = [fields.join(',')]
      
      // Add data row
      const values = fields.map(field => {
        const value = result.data[field]
        if (typeof value === 'string' && value.includes(',')) {
          return `"${value}"`
        }
        return value
      })
      rows.push(values.join(','))

      const csv = rows.join('\n')
      const blob = new Blob([csv], { type: 'text/csv' })
      const url = URL.createObjectURL(blob)
      
      const a = document.createElement('a')
      a.href = url
      a.download = `${job.filename.replace(/\.[^/.]+$/, '')}-results.csv`
      a.click()
      URL.revokeObjectURL(url)
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'complete':
        return <CheckCircle2 className="w-4 h-4 text-green-500" />
      case 'processing':
      case 'queued':
        return <Clock className="w-4 h-4 text-yellow-500" />
      case 'flagged':
        return <AlertCircle className="w-4 h-4 text-red-500" />
      default:
        return <AlertCircle className="w-4 h-4 text-slate-500" />
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Jobs</h1>
          <p className="text-slate-400 mt-1">
            {jobs.length} document{jobs.length !== 1 ? 's' : ''} found
          </p>
        </div>
        
        <button
          onClick={() => loadJobs()}
          disabled={refreshing}
          className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="bg-slate-900 rounded-xl border border-slate-800 p-4">
        <div className="flex flex-col lg:flex-row gap-4">
          {/* Status Tabs */}
          <div className="flex gap-2 overflow-x-auto pb-2 lg:pb-0">
            {statusTabs.map(tab => (
              <button
                key={tab.value}
                onClick={() => setStatusFilter(tab.value)}
                className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                  statusFilter === tab.value
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Search */}
          <form onSubmit={handleSearch} className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by filename..."
                className="w-full pl-10 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-600"
              />
            </div>
          </form>
        </div>
      </div>

      {/* Jobs Table */}
      <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-3">
            {[...Array(10)].map((_, i) => (
              <SkeletonRow key={i} />
            ))}
          </div>
        ) : jobs.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>No jobs found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-slate-400 text-sm border-b border-slate-800">
                  <th className="px-6 py-4 font-medium">Filename</th>
                  <th className="px-6 py-4 font-medium">Type</th>
                  <th className="px-6 py-4 font-medium">Status</th>
                  <th className="px-6 py-4 font-medium">Confidence</th>
                  <th className="px-6 py-4 font-medium">Date</th>
                  <th className="px-6 py-4 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {jobs.map(job => (
                  <tr key={job.id} className="hover:bg-slate-800/50">
                    <td className="px-6 py-4">
                      <p className="text-white font-medium">{job.filename}</p>
                      <p className="text-slate-500 text-sm">{job.file_path}</p>
                    </td>
                    <td className="px-6 py-4 text-slate-400 capitalize">
                      {job.document_type}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium ${
                      job.status === 'complete' ? 'bg-green-500/20 text-green-400' :
                      job.status === 'processing' || job.status === 'queued' ? 'bg-yellow-500/20 text-yellow-400' :
                      job.status === 'flagged' ? 'bg-red-500/20 text-red-400' :
                      job.status === 'error' ? 'bg-red-500/20 text-red-400' :
                      'bg-slate-700 text-slate-400'
                    }`}>
                      {getStatusIcon(job.status)}
                      {job.status}
                    </span>
                    </td>
                    <td className="px-6 py-4 text-slate-400">
                      {job.confidence ? `${Math.round(job.confidence)}%` : '—'}
                    </td>
                    <td className="px-6 py-4 text-slate-400">
                      {new Date(job.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/dashboard/results?job=${job.id}`}
                          className="p-2 text-blue-500 hover:text-blue-400"
                          title="View Results"
                        >
                          <Eye className="w-5 h-5" />
                        </Link>
                        {job.status === 'complete' && (
                          <button
                            onClick={() => downloadExcel(job)}
                            className="p-2 text-slate-500 hover:text-white"
                            title="Download Excel"
                          >
                            <Download className="w-5 h-5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}