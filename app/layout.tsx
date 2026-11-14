import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'BlockTek Radio Protocol | Verifiable audio infrastructure',
  description: 'Radio without intermediaries. Audio with verifiable provenance. Explore BlockTek Radio Protocol and AudioTrust.',
  generator: 'BlockTek Radio Protocol',
}
export const viewport: Viewport = { colorScheme: 'light', themeColor: '#FAF8F5' }
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}{process.env.NODE_ENV === 'production' && <Analytics />}</body></html>
}
