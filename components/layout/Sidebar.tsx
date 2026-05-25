'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard,
  ClipboardList,
  Package,
  GitBranch,
  Users,
  Monitor,
  Settings,
  Factory,
  LogOut,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useTenant } from '@/lib/tenant-context'
import { adminLogout, getAdminSession } from '@/lib/admin-auth'

export default function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const tenantId = useTenant()
  const [pendingCount, setPendingCount] = useState(0)
  const session = getAdminSession()

  useEffect(() => {
    if (!tenantId) return
    fetchCount()
    const ch = supabase.channel('sidebar-materials')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'material_batches' }, fetchCount)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [tenantId])

  async function fetchCount() {
    const { count } = await supabase
      .from('material_batches')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .neq('inbound_status', 'inbound')
    setPendingCount(count ?? 0)
  }

  async function handleLogout() {
    await adminLogout()
    router.replace('/login')
  }

  const navItems = [
    { href: '/dashboard', icon: LayoutDashboard, label: '总览', badge: 0 },
    { href: '/orders', icon: ClipboardList, label: '订单管理', badge: 0 },
    { href: '/materials', icon: Package, label: '原料管理', badge: pendingCount },
    { href: '/tracking', icon: GitBranch, label: '生产追踪', badge: 0 },
    { href: '/workers', icon: Users, label: '工人工监', badge: 0 },
    { href: '/screen', icon: Monitor, label: '可视化大屏', badge: 0 },
  ]

  return (
    <aside className="fixed left-0 top-0 h-full w-16 flex flex-col items-center py-4 gap-1 z-50"
      style={{ background: '#0d1117', borderRight: '1px solid rgba(255,255,255,0.06)' }}>
      {/* Logo */}
      <div className="mb-6 flex flex-col items-center gap-1">
        <div className="w-9 h-9 rounded-lg flex items-center justify-center"
          style={{ background: 'linear-gradient(135deg, #f97316, #ea580c)' }}>
          <Factory size={18} className="text-white" />
        </div>
      </div>

      {/* Nav */}
      <nav className="flex flex-col gap-1 flex-1 w-full px-2">
        {navItems.map(({ href, icon: Icon, label, badge }) => {
          const active = pathname.startsWith(href)
          return (
            <Link key={href} href={href}
              className={cn(
                'relative flex flex-col items-center gap-1 py-2 px-1 rounded-lg transition-all duration-200 group',
                active
                  ? 'bg-orange-500/15 text-orange-400'
                  : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'
              )}>
              <div className="relative">
                <Icon size={18} />
                {badge > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 min-w-[14px] h-[14px] px-0.5 rounded-full bg-orange-500 text-white text-[9px] font-bold flex items-center justify-center leading-none">
                    {badge > 99 ? '99+' : badge}
                  </span>
                )}
              </div>
              <span className="text-[9px] font-medium leading-none">{label}</span>
              {active && (
                <span className="absolute left-0 w-0.5 h-8 bg-orange-400 rounded-r-full" />
              )}
            </Link>
          )
        })}
      </nav>

      {/* Bottom */}
      <div className="mt-auto px-2 w-full flex flex-col gap-1">
        {session && (
          <div className="flex flex-col items-center gap-0.5 py-2 px-1">
            <div className="w-6 h-6 rounded-full bg-orange-500/20 flex items-center justify-center text-orange-400 text-[10px] font-bold">
              {session.displayName?.[0] ?? '?'}
            </div>
            <span className="text-[8px] text-slate-600 text-center leading-tight max-w-full truncate">
              {session.tenantId === 'gege' ? '哥哥' : '演示'}
            </span>
          </div>
        )}
        <Link href="/settings"
          className="flex flex-col items-center gap-1 py-2 px-1 rounded-lg text-slate-600 hover:text-slate-400 hover:bg-white/5 transition-all">
          <Settings size={18} />
          <span className="text-[9px]">设置</span>
        </Link>
        <button
          onClick={handleLogout}
          className="flex flex-col items-center gap-1 py-2 px-1 rounded-lg text-slate-600 hover:text-red-400 hover:bg-red-500/5 transition-all w-full">
          <LogOut size={18} />
          <span className="text-[9px]">退出</span>
        </button>
      </div>
    </aside>
  )
}
