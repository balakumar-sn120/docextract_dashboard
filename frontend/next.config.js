/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    domains: ['avatars.githubusercontent.com', 'media.licdn.com', 'supabase.co'],
  },
}

module.exports = nextConfig