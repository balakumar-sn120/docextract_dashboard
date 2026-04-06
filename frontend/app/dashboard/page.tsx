'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { 
  FileText, 
  CheckCircle2, 
  Clock, 
  AlertCircle,
  TrendingUp,
  Eye,
  Download,
  Upload
} from 'lucide-react'
import { supabase, Job, Client } from '@/lib/supabase'

interface Stats {
  totalJobs: number
  completed: number
  processing: number
  needsReview: number
  avgConfidence: number
}

function SkeletonCard() {
  return (
    <div className="p-6 bg-slate-900 rounded-xl border border-slate-800">
      <div className="animate-shimmer h-4 w-20 rounded mb-3" />
      <div className="animate-shimmer h-8 w-16 rounded" />
    </div>
  )
}

function SkeletonTable() {
  return (
    <div className="space-y-3">
      {[...Array(5)].map((_, i) => (
        <div key={i} className="animate-shimmer h-14 rounded-lg" />
      ))}
    </div>
  )
}

export default function DashboardPage() {
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<Stats>({
    totalJobs: 0,
    completed: 0,
    processing: 0,
    needsReview: 0,
    avgConfidence: 0
  })
  const [recentJobs, setRecentJobs] = useState<Job[]>([])
  const [client, setClient] = useState<Client | null>(null)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Get client data
      const { data: clientData } = await supabase
        .from('clients')
        .select('*')
        .eq('id', user.id)
        .single()
      
      if (clientData) {
        setClient(clientData)
        
        // Get jobs
        const { data: jobs } = await supabase
          .from('jobs')
          .select('*')
          .eq('client_id', user.id)
          .order('created_at', { ascending: false })
          .limit(10)

        if (jobs) {
          // Calculate stats
          const completed = jobs.filter(j => j.status === 'complete').length
          const processing = jobs.filter(j => j.status === 'processing' || j.status === 'queued').length
          const needsReview = jobs.filter(j => j.status === 'flagged').length
          const confidenceScores = jobs.filter(j => j.confidence).map(j => j.confidence)
          const avgConfidence = confidenceScores.length > 0
            ? confidenceScores.reduce((a, b) => a + b, 0) / confidenceScores.length
            : 0

          setStats({
            totalJobs: jobs.length,
            completed,
            processing,
            needsReview,
            avgConfidence: Math.round(avgConfidence * 100) / 100
          })

          setRecentJobs(jobs)
        }
      }
    } catch (error) {
      console.error('Error loading data:', error)
    } finally {
      setLoading(false)
    }
  }

  const statCards = [
    { name: 'Total Jobs', value: stats.totalJobs, icon: FileText, color: 'text-blue-500' },
    { name: 'Completed', value: stats.completed, icon: CheckCircle2, color: 'text-green-500' },
    { name: 'Processing', value: stats.processing, icon: Clock, color: 'text-yellow-500' },
    { name: 'Needs Review', value: stats.needsReview, icon: AlertCircle, color: 'text-red-500' },
  ]

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-white">Dashboard</h1>
        <p className="text-slate-400 mt-1">
          Welcome back{client?.full_name ? `, ${client.full_name}` : ''}
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {loading ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : (
          statCards.map((stat) => (
            <div
              key={stat.name}
              className="p-6 bg-slate-900 rounded-xl border border-slate-800"
            >
              <div className="flex items-center justify-between">
                <span className="text-slate-400 text-sm">{stat.name}</span>
                <stat.icon className={`w-5 h-5 ${stat.color}`} />
              </div>
              <p className="text-2xl font-bold text-white mt-2">{stat.value}</p>
            </div>
          ))
        )}
      </div>

      {/* Avg Confidence */}
      <div className="p-6 bg-slate-900 rounded-xl border border-slate-800">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-slate-400 text-sm">Average Confidence</p>
            <p className="text-2xl font-bold text-white mt-1">
              {loading ? '—' : `${stats.avgConfidence}%`}
            </p>
          </div>
          <TrendingUp className="w-8 h-8 text-green-500" />
        </div>
        <div className="mt-4 h-2 bg-slate-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-green-500 rounded-full transition-all duration-500"
            style={{ width: `${stats.avgConfidence}%` }}
          />
        </div>
      </div>

      {/* Recent Jobs */}
      <div className="bg-slate-900 rounded-xl border border-slate-800">
        <div className="p-6 border-b border-slate-800 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Recent Jobs</h2>
          <Link
            href="/dashboard/jobs"
            className="flex items-center gap-2 text-sm text-blue-500 hover:text-blue-400"
          >
            <Eye className="w-4 h-4" />
            View all
          </Link>
        </div>
        <div className="p-6">
          {loading ? (
            <SkeletonTable />
          ) : recentJobs.length === 0 ? (
            <div className="text-center py-8 text-slate-500">
              <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No jobs yet. Upload your first document to get started.</p>
              <Link
                href="/dashboard/upload"
                className="inline-flex items-center gap-2 mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium"
              >
                <Upload className="w-4 h-4" />
                Upload Document
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left text-slate-400 text-sm border-b border-slate-800">
                    <th className="pb-3 font-medium">Filename</th>
                    <th className="pb-3 font-medium">Type</th>
                    <th className="pb-3 font-medium">Status</th>
                    <th className="pb-3 font-medium">Confidence</th>
                    <th className="pb-3 font-medium">Date</th>
                    <th className="pb-3 font-medium"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {recentJobs.map((job) => (
                    <tr key={job.id} className="text-sm">
                      <td className="py-3 text-white">{job.filename}</td>
                      <td className="py-3 text-slate-400 capitalize">{job.document_type}</td>
                      <td className="py-3">
                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                          job.status === 'complete' ? 'bg-green-500/20 text-green-400' :
                          job.status === 'processing' || job.status === 'queued' ? 'bg-yellow-500/20 text-yellow-400' :
                          job.status === 'flagged' ? 'bg-red-500/20 text-red-400' :
                          'bg-slate-700 text-slate-400'
                        }`}>
                          {job.status === 'complete' && <CheckCircle2 className="w-3 h-3 mr-1" />}
                          {job.status === 'processing' && <Clock className="w-3 h-3 mr-1" />}
                          {job.status === 'queued' && <Clock className="w-3 h-3 mr-1" />}
                          {job.status === 'flagged' && <AlertCircle className="w-3 h-3 mr-1" />}
                          {job.status}
                        </span>
                      </td>
                      <td className="py-3 text-slate-400">
                        {job.confidence ? `${Math.round(job.confidence)}%` : '—'}
                      </td>
                      <td className="py-3 text-slate-400">
                        {new Date(job.created_at).toLocaleDateString()}
                      </td>
                      <td className="py-3">
                        <Link
                          href={`/dashboard/results?job=${job.id}`}
                          className="flex items-center gap-1 text-blue-500 hover:text-blue-400"
                        >
                          <Download className="w-4 h-4" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}