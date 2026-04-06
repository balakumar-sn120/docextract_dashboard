import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export interface Client {
  id: string
  email: string
  full_name: string
  avatar_url: string
  provider: string
  plan: string
  api_key: string
  created_at: string
}

export interface Job {
  id: string
  client_id: string
  filename: string
  document_type: string
  status: 'queued' | 'processing' | 'complete' | 'flagged' | 'error'
  confidence: number | null
  file_path: string
  created_at: string
  completed_at: string | null
}

export interface ExtractionResult {
  id: string
  job_id: string
  data: Record<string, any>
  confidence: number
  flagged: boolean
  created_at: string
}