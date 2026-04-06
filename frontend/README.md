# DocExtract Dashboard

A production-ready document extraction dashboard with Supabase authentication.

## Features

- **Authentication**: Google SSO, LinkedIn SSO, and Magic Link emailsign-in
- **Dashboard**: Live stats with animated skeleton loading
- **Upload**: Drag-and-drop with document type selector and live progress polling
- **Jobs**: Full table with status filters, search, auto-refresh, and Excel download
- **Results**: Extracted fields table with confidence meter, JSON/Excel export
- **Settings**: Profile, API key with curl example, plan display

## Quick Start

```bash
# 1. Extract and install
unzip docextract-dashboard.zip
cd docextract-dashboard
npm install

# 2. Copy and fill env file
cp .env.local.example .env.local
# Fill in your 4 values

# 3. Run locally
npm run dev
# → http://localhost:3000

# 4. Deploy to Vercel
npx vercel --prod
```

## Environment Variables

Create `.env.local` with:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
NEXT_PUBLIC_RAILWAY_API_URL=https://your-railway-api.railway.app
NEXT_PUBLIC_VERCEL_URL=https://your-project.vercel.app
```

## Supabase Setup

Run the SQL in `supabase-setup.sql` to create tables and triggers.

### Tables Created

- `clients`: User profiles with OAuth data
- `jobs`: Document processing jobs
- `extraction_results`: Extracted field data

### OAuth Configuration

**Google**:
1. Go to Google Cloud Console → APIs & Services → Credentials
2. Create OAuth client ID
3. Add redirect URI: `https://your-project.supabase.co/auth/v1/callback`
4. Paste credentials into Supabase → Authentication → Providers → Google

**LinkedIn**:
1. Go to LinkedIn Developer Portal → Create app
2. Add "Sign In with LinkedIn using OpenID Connect" product
3. Add same redirect URI
4. Use `linkedin_oidc` provider (not `linkedin`)

## Project Structure

```
docextract-dashboard/
├── app/
│   ├── layout.tsx          # Root layout
│   ├── page.tsx             # Redirect to dashboard
│   ├── globals.css          # Global styles
│   ├── login/page.tsx       # Login page
│   └── dashboard/
│       ├── layout.tsx       # Dashboard layout with sidebar
│       ├── page.tsx         # Overview/stats
│       ├── upload/page.tsx  # Document upload
│       ├── jobs/page.tsx    # Jobs table
│       ├── results/page.tsx  # Extraction results
│       └── settings/page.tsx # Account settings
├── components/
│   └── Sidebar.tsx          # Navigation sidebar
├── lib/
│   ├── supabase.ts          # Supabase client
│   └── auth.ts              # Auth helpers
└── public/                 # Static assets
```

## API Reference

### Upload Document

```bash
curl -X POST https://your-api.docextract.com/v1/extract \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -F "file=@document.pdf"
```

## License

MIT