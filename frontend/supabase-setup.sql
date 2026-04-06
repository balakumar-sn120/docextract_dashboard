-- DocExtract Supabase Setup SQL
-- Run this in your Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create clients table
CREATE TABLE IF NOT EXISTS clients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT UNIQUE NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  provider TEXT NOT NULL,
  plan TEXT DEFAULT 'free',
  api_key TEXT UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create jobs table
CREATE TABLE IF NOT EXISTS jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  document_type TEXT NOT NULL,
  status TEXT DEFAULT 'queued',
  confidence REAL,
  file_path TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE
);

-- Create extraction_results table
CREATE TABLE IF NOT EXISTS extraction_results (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id UUID REFERENCES jobs(id) ON DELETE CASCADE,
  data JSONB NOT NULL,
  confidence REAL NOT NULL,
  flagged BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE extraction_results ENABLE ROW LEVEL SECURITY;

-- Clients policies
CREATE POLICY "Users can view own client data" ON clients
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own client data" ON clients
  FOR UPDATE USING (auth.uid() = id);

-- Jobs policies
CREATE POLICY "Users can view own jobs" ON jobs
  FOR SELECT USING (auth.uid() = client_id);

CREATE POLICY "Users can insert own jobs" ON jobs
  FOR INSERT WITH CHECK (auth.uid() = client_id);

CREATE POLICY "Users can update own jobs" ON jobs
  FOR UPDATE USING (auth.uid() = client_id);

-- Extraction results policies
CREATE POLICY "Users can view own results" ON extraction_results
  FOR SELECT USING (
    auth.uid() = (
      SELECT client_id FROM jobs WHERE id = extraction_results.job_id
    )
  );

CREATE POLICY "Users can insert own results" ON extraction_results
  FOR INSERT WITH CHECK (
    auth.uid() = (
      SELECT client_id FROM jobs WHERE id = extraction_results.job_id
    )
  );

-- Create trigger to auto-create client on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.clients (id, email, full_name, avatar_url, provider, api_key)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.raw_user_meta_data->>'avatar_url',
    NEW.app_metadata->>'provider',
    encode(gen_random_bytes(16), 'hex')
  )
  ON CONFLICT (id) DO UPDATE
  SET full_name = COALESCE(EXCLUDED.full_name, clients.full_name),
      avatar_url = COALESCE(EXCLUDED.avatar_url, clients.avatar_url),
      provider = COALESCE(EXCLUDED.provider, clients.provider);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_jobs_client_id ON jobs(client_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_extraction_results_job_id ON extraction_results(job_id);

-- Create storage bucket for documents
INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
CREATE POLICY "Users can upload own documents" ON storage.objects
  FOR INSERT WITH CHECK (auth.uid() = bucket_owner('documents'));

CREATE POLICY "Users can view own documents" ON storage.objects
  FOR SELECT USING (auth.uid() = bucket_owner('documents'));

CREATE POLICY "Users can delete own documents" ON storage.objects
  FOR DELETE USING (auth.uid() = bucket_owner('documents'));