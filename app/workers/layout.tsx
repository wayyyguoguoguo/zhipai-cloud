'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getAdminSession, refreshAdminSession } from '@/lib/admin-auth'
import { TenantContext } from '@/lib/tenant-context'
import Sidebar from '@/components/layout/Sidebar'

export default function WorkersLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [tenantId, setTenantId] = useState<string | null>(null)

  useEffect(() => {
    async function checkAuth() {
      const cached = getAdminSession()
      if (cached) { setTenantId(cached.tenantId); return }
      const session = await refreshAdminSession()
      if (!session) { router.replace('/login'); return }
      setTenantId(session.tenantId)
    }
    checkAuth()
  }, [router])

  if (!tenantId) {
    return (
      <div className="min-h-screen bg-[#0d1117] flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-slate-600 border-t-orange-400 rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <TenantContext.Provider value={tenantId}>
      <div className="flex min-h-screen">
        <Sidebar />
        <main className="flex-1 ml-16 min-h-screen overflow-auto">
          {children}
        </main>
      </div>
    </TenantContext.Provider>
  )
}
