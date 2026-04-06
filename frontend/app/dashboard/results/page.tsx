'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { 
  FileText, 
  CheckCircle2, 
  AlertTriangle,
  Download,
  Eye,
  Copy,
  Check
} from 'lucide-react'
import { supabase, Job, ExtractionResult } from '@/lib/supabase'

function SkeletonRow() {
  return (
    <div className="animate-shimmer h-12 rounded-lg" />
  )
}

export default function ResultsPage() {
  const searchParams = useSearchParams()
  const [job, setJob] = useState<Job | null>(null)
  const [result, setResult] = useState<ExtractionResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [showRawJson, setShowRawJson] = useState(false)
  const [copied, setCopied] = useState(false)

  const jobId = searchParams.get('job')

  useEffect(() => {
    if (jobId) {
      loadResult()
    }
  }, [jobId])

  async function loadResult() {
    if (!jobId) return

    setLoading(true)
    try {
      // Get job
      const { data: jobData } = await supabase
        .from('jobs')
        .select('*')
        .eq('id', jobId)
        .single()

      if (jobData) {
        setJob(jobData)

        // Get result
        const { data: resultData } = await supabase
          .from('extraction_results')
          .select('*')
          .eq('job_id', jobId)
          .single()

        if (resultData) {
          setResult(resultData)
        }
      }
    } catch (error) {
      console.error('Error loading result:', error)
    } finally {
      setLoading(false)
    }
  }

  const downloadJson = () => {
    if (!result) return

    const json = JSON.stringify(result.data, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    
    const a = document.createElement('a')
    a.href = url
    a.download = `${job?.filename.replace(/\.[^/.]+$/, '')}-results.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const downloadExcel = () => {
    if (!result) return

    const fields = Object.keys(result.data)
    const rows = [fields.join(',')]
    
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
    a.download = `${job?.filename.replace(/\.[^/.]+$/, '')}-results.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const copyJson = async () => {
    if (!result) return

    const json = JSON.stringify(result.data, null, 2)
    await navigator.clipboard.writeText(json)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 90) return 'text-green-500'
    if (confidence >= 70) return 'text-yellow-500'
    return 'text-red-500'
  }

  const formatValue = (value: any) => {
    if (typeof value === 'boolean') {
      return value ? 'Yes' : 'No'
    }
    if (typeof value === 'number') {
      return value.toLocaleString()
    }
    if (typeof value === 'object') {
      return JSON.stringify(value)
    }
    return value || '—'
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="animate-shimmer h-8 w-48 rounded" />
        <div className="animate-shimmer h-32 rounded-xl" />
        <div className="space-y-3">
          {[...Array(10)].map((_, i) => (
            <SkeletonRow key={i} />
          ))}
        </div>
      </div>
    )
  }

  if (!job) {
    return (
      <div className="text-center py-12">
        <FileText className="w-12 h-12 mx-auto mb-3 text-slate-500" />
        <p className="text-slate-400">No job selected</p>
      </div>
    )
  }

  const fields = result ? Object.keys(result.data) : []

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-white">Extraction Results</h1>
        <p className="text-slate-400 mt-1">{job.filename}</p>
      </div>

      {/* Job Info */}
      <div className="bg-slate-900 rounded-xl border border-slate-800 p-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {/* Status */}
          <div>
            <p className="text-slate-400 text-sm mb-1">Status</p>
            <div className="flex items-center gap-2">
              {job.status === 'complete' && (
                <CheckCircle2 className="w-5 h-5 text-green-500" />
              )}
              {job.status === 'flagged' && (
                <AlertTriangle className="w-5 h-5 text-red-500" />
              )}
              <span className={`font-medium ${
                job.status === 'complete' ? 'text-green-500' :
                job.status === 'flagged' ? 'text-red-500' :
                'text-slate-400'
              }`}>
                {job.status}
              </span>
            </div>
          </div>

          {/* Document Type */}
          <div>
            <p className="text-slate-400 text-sm mb-1">Document Type</p>
            <p className="text-white font-medium capitalize">{job.document_type}</p>
          </div>

          {/* Confidence */}
          <div>
            <p className="text-slate-400 text-sm mb-1">Confidence</p>
            <div className="flex items-center gap-2">
              <span className={`text-2xl font-bold ${getConfidenceColor(result?.confidence || 0)}`}>
                {result ? Math.round(result.confidence) : '—'}%
              </span>
              {result && result.confidence < 70 && (
                <AlertTriangle className="w-5 h-5 text-red-500" title="Low confidence" />
              )}
            </div>
          </div>

          {/* Date */}
          <div>
            <p className="text-slate-400 text-sm mb-1">Processed</p>
            <p className="text-white">
              {job.completed_at 
                ? new Date(job.completed_at).toLocaleString()
                : new Date(job.created_at).toLocaleString()
              }
            </p>
          </div>
        </div>

        {/* Warning Banner */}
        {result?.flagged && (
          <div className="mt-6 p-4 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-red-500" />
            <p className="text-red-400 text-sm">
              This extraction has been flagged for manual review due to low confidence or missing fields.
            </p>
          </div>
        )}
      </div>

      {/* Results Table */}
      {result && fields.length > 0 && (
        <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
          <div className="p-6 border-b border-slate-800 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Extracted Fields</h2>
            <div className="flex items-center gap-2">
              <button
                onClick={downloadJson}
                className="flex items-center gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-sm"
              >
                <Download className="w-4 h-4" />
                JSON
              </button>
              <button
                onClick={downloadExcel}
                className="flex items-center gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-sm"
              >
                <Download className="w-4 h-4" />
                Excel
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-slate-400 text-sm border-b border-slate-800">
                  <th className="px-6 py-4 font-medium">Field</th>
                  <th className="px-6 py-4 font-medium">Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {fields.map(field => (
                  <tr key={field} className="hover:bg-slate-800/50">
                    <td className="px-6 py-4 text-slate-400 font-medium">
                      {field.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                    </td>
                    <td className="px-6 py-4 text-white">
                      {formatValue(result.data[field])}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* No Results */}
      {!result && job.status === 'complete' && (
        <div className="bg-slate-900 rounded-xl border border-slate-800 p-12 text-center">
          <FileText className="w-12 h-12 mx-auto mb-3 text-slate-500" />
          <p className="text-slate-400">No extraction results found</p>
        </div>
      )}

      {/* Raw JSON */}
      {result && (
        <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
          <div className="p-6 border-b border-slate-800 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Raw JSON</h2>
            <button
              onClick={() => setShowRawJson(!showRawJson)}
              className="flex items-center gap-2 px-3 py-2 text-blue-500 hover:text-blue-400 text-sm"
            >
              <Eye className="w-4 h-4" />
              {showRawJson ? 'Hide' : 'Show'}
            </button>
          </div>
          
          {showRawJson && (
            <div className="p-6">
              <div className="relative">
                <pre className="text-sm text-slate-300 overflow-x-auto bg-slate-950 p-4 rounded-lg">
                  {JSON.stringify(result.data, null, 2)}
                </pre>
                <button
                  onClick={copyJson}
                  className="absolute top-2 right-2 p-2 bg-slate-800 hover:bg-slate-700 rounded-lg"
                  title="Copy JSON"
                >
                  {copied ? (
                    <Check className="w-4 h-4 text-green-500" />
                  ) : (
                    <Copy className="w-4 h-4 text-slate-400" />
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}