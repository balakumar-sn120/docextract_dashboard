'use client'

import { useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { 
  Upload, 
  FileText, 
  CheckCircle2, 
  Clock, 
  AlertCircle,
  X,
  Eye
} from 'lucide-react'
import { supabase } from '@/lib/supabase'

type DocumentType = 'invoice' | 'bank_statement' | 'contract' | 'auto-detect'

interface UploadFile {
  id: string
  file: File
  name: string
  size: number
  type: DocumentType
  progress: number
  status: 'queued' | 'processing' | 'complete' | 'error'
  jobId?: string
  error?: string
}

export default function UploadPage() {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [files, setFiles] = useState<UploadFile[]>([])
  const [selectedType, setSelectedType] = useState<DocumentType>('auto-detect')
  const [isDragging, setIsDragging] = useState(false)
  const [uploading, setUploading] = useState(false)

  const documentTypes: { value: DocumentType; label: string }[] = [
    { value: 'invoice', label: 'Invoice' },
    { value: 'bank_statement', label: 'Bank Statement' },
    { value: 'contract', label: 'Contract' },
    { value: 'auto-detect', label: 'Auto-detect' },
  ]

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    
    const droppedFiles = Array.from(e.dataTransfer.files).filter(
      file => file.type === 'application/pdf' || 
              file.type.includes('image') ||
              file.name.endsWith('.doc') ||
              file.name.endsWith('.docx')
    )
    
    addFiles(droppedFiles)
  }, [selectedType])

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selectedFiles = Array.from(e.target.files)
      addFiles(selectedFiles)
    }
  }

  const addFiles = (newFiles: File[]) => {
    const uploadFiles: UploadFile[] = newFiles.map(file => ({
      id: Math.random().toString(36).substr(2, 9),
      file,
      name: file.name,
      size: file.size,
      type: selectedType,
      progress: 0,
      status: 'queued'
    }))
    
    setFiles(prev => [...prev, ...uploadFiles])
    uploadFiles.forEach(uploadFile => {
      processUpload(uploadFile)
    })
  }

  const processUpload = async (uploadFile: UploadFile) => {
    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        throw new Error('Not authenticated')
      }

      // Upload file to Supabase Storage
      const filePath = `${user.id}/${Date.now()}-${uploadFile.file.name}`
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('documents')
        .upload(filePath, uploadFile.file)

      if (uploadError) throw uploadError

      // Create job record
      const { data: job, error: jobError } = await supabase
        .from('jobs')
        .insert({
          client_id: user.id,
          filename: uploadFile.file.name,
          document_type: uploadFile.type,
          status: 'queued',
          file_path: filePath
        })
        .select()
        .single()

      if (jobError) throw jobError

      // Update file status to processing
      setFiles(prev => prev.map(f => 
        f.id === uploadFile.id 
          ? { ...f, status: 'processing', jobId: job.id }
          : f
      ))

      // Poll for job completion
      pollJobStatus(job.id, uploadFile.id)
    } catch (error: any) {
      setFiles(prev => prev.map(f => 
        f.id === uploadFile.id 
          ? { ...f, status: 'error', error: error.message }
          : f
      ))
    }
  }

  const pollJobStatus = (jobId: string, fileId: string) => {
    const pollInterval = setInterval(async () => {
      const { data: job } = await supabase
        .from('jobs')
        .select('*')
        .eq('id', jobId)
        .single()

      if (job && (job.status === 'complete' || job.status === 'error' || job.status === 'flagged')) {
        clearInterval(pollInterval)
        
        let progress = 100
        if (job.status === 'processing') progress = 50
        
        setFiles(prev => prev.map(f => 
          f.id === fileId 
            ? { ...f, status: job.status, progress, jobId: job.id }
            : f
        ))
      } else if (job) {
        setFiles(prev => prev.map(f => 
          f.id === fileId 
            ? { ...f, progress: Math.min(f.progress + 10, 90) }
            : f
        ))
      }
    }, 3000)
  }

  const removeFile = (id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id))
  }

  const viewResults = (jobId: string) => {
    router.push(`/dashboard/results?job=${jobId}`)
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-white">Upload Documents</h1>
        <p className="text-slate-400 mt-1">
          Upload documents for AI-powered extraction
        </p>
      </div>

      {/* Document Type Selector */}
      <div className="bg-slate-900 rounded-xl border border-slate-800 p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Document Type</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {documentTypes.map(type => (
            <button
              key={type.value}
              onClick={() => setSelectedType(type.value)}
              className={`p-4 rounded-lg border transition-colors ${
                selectedType === type.value
                  ? 'border-blue-600 bg-blue-600/10 text-white'
                  : 'border-slate-800 text-slate-400 hover:border-slate-700 hover:text-white'
              }`}
            >
              {type.label}
            </button>
          ))}
        </div>
      </div>

      {/* Drop Zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors ${
          isDragging 
            ? 'border-blue-600 bg-blue-600/10' 
            : 'border-slate-800 hover:border-slate-700'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.doc,.docx,image/*"
          onChange={handleFileSelect}
          className="hidden"
        />
        <Upload className="w-12 h-12 mx-auto mb-4 text-slate-500" />
        <p className="text-white font-medium mb-1">
          Drag and drop your files here
        </p>
        <p className="text-slate-400 text-sm">
          or click to browse
        </p>
        <p className="text-slate-500 text-xs mt-2">
          Supports PDF, DOC, DOCX, and images
        </p>
      </div>

      {/* Upload Queue */}
      {files.length > 0 && (
        <div className="bg-slate-900 rounded-xl border border-slate-800">
          <div className="p-6 border-b border-slate-800">
            <h2 className="text-lg font-semibold text-white">
              Upload Queue ({files.length})
            </h2>
          </div>
          <div className="divide-y divide-slate-800">
            {files.map(file => (
              <div key={file.id} className="p-4 flex items-center gap-4">
                <FileText className="w-10 h-10 text-slate-500 flex-shrink-0" />
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-white font-medium truncate">
                      {file.name}
                    </p>
                    <p className="text-slate-400 text-sm flex-shrink-0 ml-2">
                      {formatFileSize(file.size)}
                    </p>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          file.status === 'error' 
                            ? 'bg-red-500' 
                            : file.status === 'complete'
                            ? 'bg-green-500'
                            : 'bg-blue-600'
                        }`}
                        style={{ width: `${file.progress}%` }}
                      />
                    </div>
                    
                    <span className={`text-xs font-medium flex-shrink-0 ${
                      file.status === 'complete' ? 'text-green-500' :
                      file.status === 'error' ? 'text-red-500' :
                      'text-slate-400'
                    }`}>
                      {file.status === 'queued' && 'Queued'}
                      {file.status === 'processing' && 'Processing...'}
                      {file.status === 'complete' && 'Complete'}
                      {file.status === 'error' && 'Error'}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {file.status === 'complete' && file.jobId && (
                    <button
                      onClick={() => viewResults(file.jobId!)}
                      className="p-2 text-blue-500 hover:text-blue-400"
                      title="View Results"
                    >
                      <Eye className="w-5 h-5" />
                    </button>
                  )}
                  
                  <button
                    onClick={() => removeFile(file.id)}
                    className="p-2 text-slate-500 hover:text-white"
                    title="Remove"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}