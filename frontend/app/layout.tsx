import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'DocExtract Dashboard',
  description: 'Document extraction and processing dashboard',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}