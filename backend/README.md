# DocExtract API

Production FastAPI backend for AI document extraction.
Stack: FastAPI · Docling · Groq · Celery · Redis · Supabase · Railway

---

## Project structure

```
docextract-api/
├── app/
│   ├── main.py          # FastAPI app, middleware, Prometheus, Sentry
│   ├── config.py        # All env vars (pydantic-settings)
│   ├── database.py      # Supabase client + DB helpers
│   ├── extractor.py     # Core pipeline: Docling → Groq → Pydantic
│   ├── schemas.py       # All Pydantic models
│   ├── auth.py          # API key dependency
│   ├── worker.py        # Celery tasks + email notifications
│   └── routes/
│       ├── upload.py    # POST /api/upload
│       ├── jobs.py      # GET /api/jobs, /api/jobs/{id}, /download
│       ├── health.py    # GET /health, /ping, /metrics
│       └── admin.py     # GET /api/admin/stats, /clients, /flagged
├── tests/
│   └── test_api.py
├── Procfile             # Railway process definitions
├── railway.json         # Railway deploy config + health checks
├── nixpacks.toml        # System dependencies (poppler, ghostscript)
├── requirements.txt
└── .env.example
```

---

## Deploy to Railway — step by step

### 1. Install Railway CLI

```bash
# macOS / Linux
curl -fsSL https://railway.app/install.sh | sh

# Or with npm
npm install -g @railway/cli
```

### 2. Login and create project

```bash
railway login
railway init
# Choose: "Empty project"
# Name it: docextract-api
```

### 3. Add Redis (for Celery job queue)

```bash
railway add
# Select: Redis
# Railway auto-injects REDIS_URL into your environment
```

### 4. Set all environment variables

```bash
# Copy .env.example and fill in your values, then:
railway variables set \
  SUPABASE_URL="https://xxx.supabase.co" \
  SUPABASE_SERVICE_KEY="eyJ..." \
  GROQ_API_KEY="gsk_..." \
  RESEND_API_KEY="re_..." \
  SENTRY_DSN="https://xxx@sentry.io/xxx" \
  SECRET_KEY="$(openssl rand -hex 32)" \
  ADMIN_SECRET_KEY="$(openssl rand -hex 16)" \
  FLOWER_USER="admin" \
  FLOWER_PASSWORD="$(openssl rand -hex 12)" \
  ENVIRONMENT="production" \
  ALLOWED_ORIGINS='["https://your-dashboard.vercel.app"]'
```

### 5. Deploy

```bash
railway up
# Railway builds with Nixpacks, installs deps, starts uvicorn
# Your API is live at: https://your-project.railway.app
```

### 6. Check it's working

```bash
curl https://your-project.railway.app/health
# Should return: {"status":"healthy","checks":{"supabase":"ok","redis":"ok","groq":"ok"}}

curl https://your-project.railway.app/ping
# {"pong": true}
```

---

## Deploy Celery worker (separate Railway service)

The web service handles HTTP. The worker processes jobs in the background.

```bash
# In Railway dashboard:
# 1. New Service → GitHub Repo (same repo)
# 2. Override start command:
celery -A app.worker worker --loglevel=info --concurrency=4 -E

# 3. Add same environment variables
# 4. Deploy
```

### Deploy Flower monitoring dashboard

```bash
# Another Railway service, start command:
celery -A app.worker flower --port=8080 --basic_auth=${FLOWER_USER}:${FLOWER_PASSWORD}
```

Access at: `https://your-flower.railway.app`
Login: admin / (your FLOWER_PASSWORD)

---

## Supabase setup — run this SQL

```sql
-- Clients
create table clients (
  id           uuid primary key default gen_random_uuid(),
  auth_user_id uuid references auth.users(id) on delete set null,
  name         text,
  email        text unique not null,
  company      text,
  api_key      text unique default gen_random_uuid()::text,
  plan         text default 'starter',
  doc_types    text[] default array['invoice'],
  monthly_limit int default 500,
  created_at   timestamptz default now()
);

-- Jobs
create table jobs (
  id             uuid primary key,
  client_id      uuid references clients(id) on delete cascade,
  filename       text not null,
  doc_type       text,
  status         text default 'queued',
  result_data    jsonb,
  confidence     float,
  flagged        boolean default false,
  error_message  text,
  processing_ms  int,
  created_at     timestamptz default now(),
  completed_at   timestamptz
);

-- Indexes for performance
create index idx_jobs_client_id  on jobs(client_id);
create index idx_jobs_status     on jobs(status);
create index idx_jobs_created_at on jobs(created_at desc);
create index idx_clients_api_key on clients(api_key);

-- Auto-create client on first Supabase auth sign-in
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.clients (auth_user_id, email, name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1))
  )
  on conflict (email) do update set auth_user_id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
```

---

## API reference

### Authentication
All endpoints require: `X-API-Key: your-api-key`

### Upload a document
```
POST /api/upload
Headers: X-API-Key: xxx
Body: multipart/form-data
  file: <file>
  doc_type: invoice | bank_statement | contract | auto

Response:
{
  "job_id": "uuid",
  "status": "queued",
  "message": "Extraction started. Poll GET /api/jobs/{job_id}",
  "filename": "invoice.pdf"
}
```

### Check job status
```
GET /api/jobs/{job_id}
Headers: X-API-Key: xxx

Response (when complete):
{
  "id": "uuid",
  "status": "complete",
  "confidence": 0.96,
  "flagged": false,
  "result_data": { "vendor_name": "...", ... },
  "processing_ms": 4200
}
```

### Download Excel result
```
GET /api/jobs/{job_id}/download
Headers: X-API-Key: xxx

Response:
{
  "download_url": "https://supabase.co/storage/...",
  "expires_in": 3600,
  "filename": "invoice_extracted.xlsx"
}
```

### List all jobs
```
GET /api/jobs?status=complete&limit=50
Headers: X-API-Key: xxx
```

### Health check
```
GET /health
Returns: { "status": "healthy", "checks": { "supabase": "ok", "redis": "ok", "groq": "ok" } }
```

### Admin stats (requires X-Admin-Key header)
```
GET /api/admin/stats
GET /api/admin/clients
GET /api/admin/flagged
POST /api/admin/clients  { "name": "...", "email": "...", "plan": "starter" }
```

---

## Monitoring

### 1. Sentry (error tracking)
- Sign up at sentry.io (free: 5k errors/month)
- Create a Python project → copy DSN → add to SENTRY_DSN env var
- Every unhandled exception is captured with full stack trace + request context

### 2. Prometheus + Grafana (metrics)
- Metrics endpoint: `GET /metrics`
- Tracks: request count, latency histogram, in-progress requests per endpoint
- Connect Grafana Cloud (free) → add Prometheus data source → point to /metrics

### 3. Flower (Celery task monitoring)
- Live view of all queued/active/completed/failed tasks
- Worker status and throughput
- Accessible at your flower Railway service URL

### 4. Railway built-in monitoring
- CPU, memory, network graphs in Railway dashboard
- Automatic restart on failure (railway.json: restartPolicyType: ON_FAILURE)
- Health check every 30s: if /health fails → Railway restarts the service

### 5. UptimeRobot (uptime monitoring — free)
- Sign up at uptimerobot.com
- Add monitor: HTTPS → your Railway URL → /ping
- Alerts via email/Telegram if API goes down

---

## Local development

```bash
# Clone and setup
git clone your-repo
cd docextract-api
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# Fill in .env

# Start Redis locally
docker run -d -p 6379:6379 redis:alpine

# Terminal 1: API server
uvicorn app.main:app --reload --port 8000

# Terminal 2: Celery worker
celery -A app.worker worker --loglevel=info

# Terminal 3: Flower
celery -A app.worker flower --port=5555

# Test upload
curl -X POST http://localhost:8000/api/upload \
  -H "X-API-Key: your-test-key" \
  -F "file=@test_invoice.pdf" \
  -F "doc_type=invoice"
```

---

## Operations playbook

### Onboard a new client (30 seconds)
```bash
curl -X POST https://your-api.railway.app/api/admin/clients \
  -H "X-Admin-Key: your-admin-key" \
  -H "Content-Type: application/json" \
  -d '{"name":"Acme Ltd","email":"accounts@acme.com","plan":"business"}'
# Returns: { "api_key": "uuid-to-send-to-client", ... }
```

### Check for flagged jobs needing review
```bash
curl https://your-api.railway.app/api/admin/flagged \
  -H "X-Admin-Key: your-admin-key"
```

### View all stats
```bash
curl https://your-api.railway.app/api/admin/stats \
  -H "X-Admin-Key: your-admin-key"
```

### Force redeploy on Railway
```bash
railway redeploy
```

### View live logs
```bash
railway logs --follow
```

### Roll back to previous deploy
```bash
# Railway dashboard → Deployments → click any previous deploy → Rollback
```
