import { supabase } from './supabase'

export async function signInWithOAuth(provider: 'google' | 'linkedin_oidc') {
  const vercelUrl = process.env.NEXT_PUBLIC_VERCEL_URL || 'http://localhost:3000'
  const redirectUrl = `${vercelUrl}/auth/callback`
  
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: redirectUrl,
      scopes: provider === 'linkedin_oidc' ? 'openid profile email' : 'openid profile email',
    },
  })

  if (error) throw error
  return data
}

export async function signInWithMagicLink(email: string) {
  const vercelUrl = process.env.NEXT_PUBLIC_VERCEL_URL || 'http://localhost:3000'
  const redirectUrl = `${vercelUrl}/auth/callback`
  
  const { data, error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: redirectUrl,
    },
  })

  if (error) throw error
  return data
}

export async function signOut() {
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}

export async function getSession() {
  const { data: { session }, error } = await supabase.auth.getSession()
  if (error) throw error
  return session
}

export async function getUser() {
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error) throw error
  return user
}