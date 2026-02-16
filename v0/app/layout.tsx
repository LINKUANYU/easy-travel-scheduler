import type { Metadata, Viewport } from 'next'
import { Noto_Sans_TC, Geist } from 'next/font/google'

import './globals.css'

const _notoSansTC = Noto_Sans_TC({ subsets: ['latin'], variable: '--font-noto-sans-tc' })
const _geist = Geist({ subsets: ['latin'], variable: '--font-geist' })

export const metadata: Metadata = {
  title: '旅遊景點探索 | Travel Attractions',
  description: '探索北海道最受歡迎的旅遊景點，規劃您的完美旅程',
  generator: 'v0.app',
}

export const viewport: Viewport = {
  themeColor: '#1a8cff',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="zh-TW">
      <body className={`${_notoSansTC.variable} ${_geist.variable} font-sans antialiased`}>{children}</body>
    </html>
  )
}
