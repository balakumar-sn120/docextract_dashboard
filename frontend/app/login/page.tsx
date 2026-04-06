'use client'

import { useState } from 'react'
import { signInWithOAuth, signInWithMagicLink } from '@/lib/auth'
import { FcGoogle } from 'react-icons/fc'
import { FaLinkedin } from 'react-icons/fa'
import { Mail } from 'lucide-react'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [magicLinkSent, setMagicLinkSent] = useState(false)
  const [error, setError] = useState('')

  const handleGoogleSignIn = async () => {
    setLoading(true)
    setError('')
    try {
      await signInWithOAuth('google')
    } catch (err: any) {
      setError(err.message || 'Failed to sign in with Google')
    } finally {
      setLoading(false)
    }
  }

  const handleLinkedInSignIn = async () => {
    setLoading(true)
    setError('')
    try {
      await signInWithOAuth('linkedin_oidc')
    } catch (err: any) {
      setError(err.message || 'Failed to sign in with LinkedIn')
    } finally {
      setLoading(false)
    }
  }

  const handleMagicLinkSignIn = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email) {
      setError('Please enter your email address')
      return
    }

    setLoading(true)
    setError('')
    try {
      await signInWithMagicLink(email)
      setMagicLinkSent(true)
    } catch (err: any) {
      setError(err.message || 'Failed to send magic link')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex">
      {/* Left side - Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-12 flex-col justify-between relative overflow-hidden">
        {/* Background pattern */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute inset-0" style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.4'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
          }} />
        </div>

        <div className="relative z-10">
          <h1 className="text-4xl font-bold text-white mb-4">DocExtract</h1>
          <p className="text-slate-400 text-lg">Intelligent document processing for modern businesses</p>
        </div>

        <div className="relative z-10">
          <h2 className="text-3xl font-semibold text-white mb-6">Extract data from any document in seconds</h2>
          <ul className="space-y-4 text-slate-400">
            <li className="flex items-center gap-3">
              <div className="w-2 h-2 bg-green-500 rounded-full" />
              <span>Automatic field detection and extraction</span>
            </li>
            <li className="flex items-center gap-3">
              <div className="w-2 h-2 bg-green-500 rounded-full" />
              <span>Confidence scoring for quality assurance</span>
            </li>
            <li className="flex items-center gap-3">
              <div className="w-2 h-2 bg-green-500 rounded-full" />
              <span>Export to JSON, Excel, or directly to your API</span>
            </li>
          </ul>
        </div>

        <div className="relative z-10 text-slate-500 text-sm">
          © 2024 DocExtract. All rights reserved.
        </div>
      </div>

      {/* Right side - Login form */}
      <div className="w-full lg:w-1/2 bg-slate-950 p-8 flex items-center justify-center">
        <div className="w-full max-w-md space-y-8">
          {/* Mobile header */}
          <div className="lg:hidden">
            <h1 className="text-3xl font-bold text-white mb-2">DocExtract</h1>
            <p className="text-slate-400">Intelligent document processing</p>
          </div>

          <div>
            <h2 className="text-2xl font-semibold text-white">Welcome back</h2>
            <p className="text-slate-400 mt-2">Sign in to access your documents</p>
          </div>

          {error && (
            <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
              {error}
            </div>
          )}

          {magicLinkSent ? (
            <div className="p-6 bg-green-500/10 border border-green-500/20 rounded-lg">
              <div className="flex items-center gap-3 mb-3">
                <Mail className="w-6 h-6 text-green-500" />
                <h3 className="text-lg font-medium text-white">Check your email</h3>
              </div>
              <p className="text-slate-400 text-sm">
                We sent a magic link to <span className="text-white font-medium">{email}</span>.
                Click the link in the email to sign in.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Google Sign In */}
              <button
                onClick={handleGoogleSignIn}
                disabled={loading}
                className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-white hover:bg-slate-100 text-slate-900 font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <FcGoogle className="w-5 h-5" />
                Continue with Google
              </button>

              {/* LinkedIn Sign In */}
              <button
                onClick={handleLinkedInSignIn}
                disabled={loading}
                className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-[#0A66C2] hover:bg-[#004182] text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <FaLinkedin className="w-5 h-5" />
                Continue with LinkedIn
              </button>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-800" />
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-4 bg-slate-950 text-slate-500">or</span>
                </div>
              </div>

              {/* Magic Link Form */}
              <form onSubmit={handleMagicLinkSignIn} className="space-y-4">
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-slate-400 mb-2">
                    Email address
                  </label>
                  <input
                    type="email"
                    id="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full px-4 py-3 bg-slate-900 border border-slate-800 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-slate-700 focus:ring-1 focus:ring-slate-700"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-slate-800 hover:bg-slate-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Mail className="w-5 h-5" />
                  Send Magic Link
                </button>
              </form>
            </div>
          )}

          <p className="text-center text-slate-500 text-sm">
            By signing in, you agree to our{' '}
            <a href="#" className="text-slate-400 hover:text-white underline">Terms of Service</a>
            {' '}and{' '}
            <a href="#" className="text-slate-400 hover:text-white underline">Privacy Policy</a>
          </p>
        </div>
      </div>
    </div>
  )
}