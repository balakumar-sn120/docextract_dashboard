'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { signOut } from '@/lib/auth'
import { 
  User, 
  Copy, 
  Check, 
  LogOut,
  Key,
  CreditCard,
  ExternalLink
} from 'lucide-react'
import { supabase, Client } from '@/lib/supabase'

export default function SettingsPage() {
  const router = useRouter()
  const [client, setClient] = useState<Client | null>(null)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    loadClient()
  }, [])

  async function loadClient() {
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }

      const { data: clientData } = await supabase
        .from('clients')
        .select('*')
        .eq('id', user.id)
        .single()

      if (clientData) {
        setClient(clientData)
      }
    } catch (error) {
      console.error('Error loading client:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSignOut = async () => {
    await signOut()
    router.push('/login')
  }

  const copyApiKey = async () => {
    if (!client?.api_key) return
    
    await navigator.clipboard.writeText(client.api_key)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const getProviderName = (provider: string) => {
    switch (provider) {
      case 'google':
        return 'Google'
      case 'linkedin_oidc':
        return 'LinkedIn'
      default:
        return provider
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="animate-shimmer h-8 w-48 rounded" />
        <div className="animate-shimmer h-64 rounded-xl" />
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-white">Settings</h1>
        <p className="text-slate-400 mt-1">Manage your account and preferences</p>
      </div>

      {/* Profile Section */}
      <div className="bg-slate-900 rounded-xl border border-slate-800 p-6">
        <h2 className="text-lg font-semibold text-white mb-6">Profile</h2>
        
        <div className="flex items-start gap-6">
          {/* Avatar */}
          <div className="w-20 h-20 rounded-full overflow-hidden bg-slate-800 flex-shrink-0">
            {client?.avatar_url ? (
              <Image
                src={client.avatar_url}
                alt={client.full_name || 'Profile'}
                width={80}
                height={80}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <User className="w-8 h-8 text-slate-500" />
              </div>
            )}
          </div>

          {/* Info */}
          <div className="flex-1">
            <h3 className="text-xl font-semibold text-white">
              {client?.full_name || 'User'}
            </h3>
            <p className="text-slate-400">{client?.email}</p>
            <div className="flex items-center gap-2 mt-2">
              <span className="text-sm text-slate-500">Signed in with</span>
              <span className="px-2 py-1 bg-slate-800 text-slate-400 rounded text-sm">
                {getProviderName(client?.provider || '')}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* API Key Section */}
      <div className="bg-slate-900 rounded-xl border border-slate-800 p-6">
        <h2 className="text-lg font-semibold text-white mb-6">API Key</h2>
        
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Key className="w-5 h-5 text-slate-500" />
            <span className="text-slate-400">Your API key for programmatic access</span>
          </div>
          
          <div className="flex items-center gap-2">
            <code className="flex-1 px-4 py-3 bg-slate-950 text-slate-300 rounded-lg font-mono text-sm overflow-x-auto">
              {client?.api_key || 'No API key generated'}
            </code>
            <button
              onClick={copyApiKey}
              disabled={!client?.api_key}
              className="p-3 bg-slate-800 hover:bg-slate-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
              title="Copy API key"
            >
              {copied ? (
                <Check className="w-5 h-5 text-green-500" />
              ) : (
                <Copy className="w-5 h-5 text-slate-400" />
              )}
            </button>
          </div>

          {/* Curl Example */}
          <div className="mt-4">
            <p className="text-slate-400 text-sm mb-2">Example curl request:</p>
            <pre className="p-4 bg-slate-950 text-slate-300 rounded-lg font-mono text-sm overflow-x-auto">
{`curl -X POST https://your-api.docextract.com/v1/extract \\
  -H "Authorization: Bearer ${client?.api_key || 'YOUR_API_KEY'}" \\
  -F "file=@document.pdf"`}
            </pre>
          </div>
        </div>
      </div>

      {/* Plan Section */}
      <div className="bg-slate-900 rounded-xl border border-slate-800 p-6">
        <h2 className="text-lg font-semibold text-white mb-6">Plan</h2>
        
        <div className="flex items-center gap-4">
          <CreditCard className="w-6 h-6 text-slate-500" />
          <div>
            <p className="text-white font-medium capitalize">
              {client?.plan || 'Free'} Plan
            </p>
            <p className="text-slate-400 text-sm">
              {client?.plan === 'pro' 
                ? 'Unlimited documents and priority processing'
                : '100 documents per month'
              }
            </p>
          </div>
        </div>
      </div>

      {/* Sign Out */}
      <div className="bg-slate-900 rounded-xl border border-slate-800 p-6">
        <button
          onClick={handleSignOut}
          className="flex items-center gap-3 text-red-400 hover:text-red-300"
        >
          <LogOut className="w-5 h-5" />
          Sign out
        </button>
      </div>
    </div>
  )
}