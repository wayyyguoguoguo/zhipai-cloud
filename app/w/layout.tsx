import type { Metadata, Viewport } from 'next'

export const metadata: Metadata = {
  title: '智排云 · 工人操作台',
  description: '扫码操作',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export default function WorkerLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#0d1117]">
      {children}
    </div>
  )
}
