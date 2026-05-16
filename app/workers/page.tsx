'use client'

import { useState, useEffect } from 'react'
import { cn, ROLE_LABELS } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { Users, QrCode, TrendingUp, Package, Clock, ChevronDown, ChevronUp } from 'lucide-react'

type WorkerProfile = {
  id: string
  worker_no: string
  display_name: string
  role_type: string
  product_line: string | null
  is_active: boolean
  last_login: string | null
}

type WorkerStat = {
  worker_id: string
  today_batches: number
  today_weight: number
  week_batches: number
  week_weight: number
  last_action: string | null
}

const ROLE_ORDER = ['weigher', 'metal_worker', 'heat_worker', 'grinder', 'straightener', 'inspector', 'warehouse', 'admin']

function QRModal({ workerNo, name, onClose }: { workerNo: string; name: string; onClose: () => void }) {
  const url = typeof window !== 'undefined'
    ? `${window.location.origin}/w?worker=${workerNo}`
    : `/w?worker=${workerNo}`

  useEffect(() => {
    // 动态加载 qrcode 库生成二维码
    const canvas = document.getElementById('qr-canvas') as HTMLCanvasElement
    if (!canvas) return
    import('qrcode').then(QRCode => {
      QRCode.toCanvas(canvas, url, {
        width: 240,
        margin: 2,
        color: { dark: '#f97316', light: '#0d1117' },
      })
    }).catch(() => {
      // fallback: 显示文字
    })
  }, [url])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}>
      <div className="bg-[#161b22] border border-white/10 rounded-2xl p-6 flex flex-col items-center gap-4 shadow-2xl"
        onClick={e => e.stopPropagation()}>
        <div className="text-sm font-medium text-slate-200">{name} · {workerNo}</div>
        <div className="bg-[#0d1117] p-3 rounded-xl border border-white/5">
          <canvas id="qr-canvas" />
        </div>
        <p className="text-xs text-slate-500 text-center max-w-[200px] break-all">{url}</p>
        <div className="flex gap-3">
          <button
            onClick={() => window.print()}
            className="px-4 py-2 rounded-lg text-xs text-slate-400 border border-white/10 hover:bg-white/5 transition-all">
            打印
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-xs text-white border border-orange-500/30 bg-orange-500/10 hover:bg-orange-500/20 transition-all">
            关闭
          </button>
        </div>
      </div>
    </div>
  )
}

export default function WorkersPage() {
  const [workers, setWorkers] = useState<WorkerProfile[]>([])
  const [stats, setStats] = useState<Record<string, WorkerStat>>({})
  const [loading, setLoading] = useState(true)
  const [qrWorker, setQrWorker] = useState<{ no: string; name: string } | null>(null)
  const [expandedRole, setExpandedRole] = useState<string | null>(null)
  const [dateRange, setDateRange] = useState<'today' | 'week'>('today')

  useEffect(() => {
    fetchAll()
  }, [])

  async function fetchAll() {
    setLoading(true)
    const { data: workerData } = await supabase
      .from('worker_profiles')
      .select('id, worker_no, display_name, role_type, product_line, is_active, last_login')
      .order('worker_no')

    if (!workerData) { setLoading(false); return }
    setWorkers(workerData)

    // 查今日和本周的 process_transfers 统计
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const weekStart = new Date()
    weekStart.setDate(weekStart.getDate() - 6)
    weekStart.setHours(0, 0, 0, 0)

    const { data: transfers } = await supabase
      .from('process_transfers')
      .select('worker_id, weight_in, created_at, order_id')
      .gte('created_at', weekStart.toISOString())

    const statMap: Record<string, WorkerStat> = {}
    for (const w of workerData) {
      statMap[w.id] = {
        worker_id: w.id,
        today_batches: 0,
        today_weight: 0,
        week_batches: 0,
        week_weight: 0,
        last_action: null,
      }
    }

    if (transfers) {
      // 按 worker_id + order_id 去重计批次
      const todayOrders: Record<string, Set<string>> = {}
      const weekOrders: Record<string, Set<string>> = {}

      for (const t of transfers) {
        if (!t.worker_id) continue
        const isToday = new Date(t.created_at) >= todayStart
        if (!weekOrders[t.worker_id]) weekOrders[t.worker_id] = new Set()
        weekOrders[t.worker_id].add(t.order_id)
        if (isToday) {
          if (!todayOrders[t.worker_id]) todayOrders[t.worker_id] = new Set()
          todayOrders[t.worker_id].add(t.order_id)
        }
        if (statMap[t.worker_id]) {
          if (t.weight_in) {
            statMap[t.worker_id].week_weight += t.weight_in
            if (isToday) statMap[t.worker_id].today_weight += t.weight_in
          }
          // 最后操作时间
          if (!statMap[t.worker_id].last_action || t.created_at > statMap[t.worker_id].last_action!) {
            statMap[t.worker_id].last_action = t.created_at
          }
        }
      }

      for (const [wid, orders] of Object.entries(weekOrders)) {
        if (statMap[wid]) statMap[wid].week_batches = orders.size
      }
      for (const [wid, orders] of Object.entries(todayOrders)) {
        if (statMap[wid]) statMap[wid].today_batches = orders.size
      }
    }

    setStats(statMap)
    setLoading(false)
  }

  // 按角色分组
  const grouped = ROLE_ORDER.reduce<Record<string, WorkerProfile[]>>((acc, role) => {
    const list = workers.filter(w => w.role_type === role)
    if (list.length > 0) acc[role] = list
    return acc
  }, {})

  const totalToday = Object.values(stats).reduce((s, v) => s + v.today_batches, 0)
  const totalWeek = Object.values(stats).reduce((s, v) => s + v.week_batches, 0)
  const activeWorkers = workers.filter(w => {
    const s = stats[w.id]
    return s && s.today_batches > 0
  }).length

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-slate-600 text-sm">加载中...</div>
  }

  return (
    <div className="p-6 space-y-5">
      {qrWorker && (
        <QRModal workerNo={qrWorker.no} name={qrWorker.name} onClose={() => setQrWorker(null)} />
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-100">工人工监</h1>
          <p className="text-sm text-slate-500 mt-0.5">共 {workers.filter(w => w.role_type !== 'admin').length} 名工人</p>
        </div>
        <div className="flex gap-1.5">
          {(['today', 'week'] as const).map(r => (
            <button key={r}
              onClick={() => setDateRange(r)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs transition-all',
                dateRange === r
                  ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
                  : 'bg-[#161b22] text-slate-500 border border-white/5 hover:text-slate-300'
              )}>
              {r === 'today' ? '今日' : '本周'}
            </button>
          ))}
        </div>
      </div>

      {/* 汇总统计 */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: dateRange === 'today' ? '今日处理批次' : '本周处理批次', value: dateRange === 'today' ? totalToday : totalWeek, icon: Package, color: 'text-orange-400' },
          { label: '今日活跃工人', value: activeWorkers, icon: Users, color: 'text-green-400' },
          { label: '工人总数', value: workers.filter(w => w.role_type !== 'admin').length, icon: TrendingUp, color: 'text-blue-400' },
        ].map((s, i) => (
          <div key={i} className="bg-[#161b22] rounded-xl border border-white/5 p-4">
            <div className="flex items-center gap-2 mb-2">
              <s.icon size={14} className={s.color} />
              <span className="text-xs text-slate-500">{s.label}</span>
            </div>
            <div className="text-2xl font-bold text-slate-100">{s.value}</div>
          </div>
        ))}
      </div>

      {/* 按角色分组展示 */}
      <div className="space-y-3">
        {Object.entries(grouped).filter(([role]) => role !== 'admin').map(([role, list]) => {
          const isExpanded = expandedRole === role || expandedRole === null
          const roleTotal = list.reduce((s, w) => s + (dateRange === 'today' ? (stats[w.id]?.today_batches ?? 0) : (stats[w.id]?.week_batches ?? 0)), 0)

          return (
            <div key={role} className="bg-[#161b22] rounded-xl border border-white/5 overflow-hidden">
              <button
                onClick={() => setExpandedRole(expandedRole === role ? null : role)}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/2 transition-colors">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-slate-300">{ROLE_LABELS[role]}</span>
                  <span className="text-xs text-slate-600">{list.length} 人</span>
                  {roleTotal > 0 && (
                    <span className="text-xs text-orange-400 bg-orange-500/10 px-2 py-0.5 rounded-full">
                      {roleTotal} 批次
                    </span>
                  )}
                </div>
                {expandedRole === role
                  ? <ChevronUp size={14} className="text-slate-600" />
                  : <ChevronDown size={14} className="text-slate-600" />
                }
              </button>

              {(expandedRole === role || expandedRole === null) && (
                <div className="border-t border-white/5">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-slate-600 text-xs border-b border-white/5">
                        <th className="text-left px-4 py-2 font-normal">工号 / 姓名</th>
                        <th className="text-left px-4 py-2 font-normal">产品线</th>
                        <th className="text-center px-4 py-2 font-normal">
                          {dateRange === 'today' ? '今日批次' : '本周批次'}
                        </th>
                        <th className="text-center px-4 py-2 font-normal">
                          {dateRange === 'today' ? '今日称重(kg)' : '本周称重(kg)'}
                        </th>
                        <th className="text-center px-4 py-2 font-normal">最后操作</th>
                        <th className="text-center px-4 py-2 font-normal">状态</th>
                        <th className="text-center px-4 py-2 font-normal">二维码</th>
                      </tr>
                    </thead>
                    <tbody>
                      {list.map(w => {
                        const s = stats[w.id]
                        const batches = dateRange === 'today' ? s?.today_batches ?? 0 : s?.week_batches ?? 0
                        const weight = dateRange === 'today' ? s?.today_weight ?? 0 : s?.week_weight ?? 0
                        const isOnline = s?.last_action
                          ? (Date.now() - new Date(s.last_action).getTime()) < 2 * 60 * 60 * 1000
                          : false

                        return (
                          <tr key={w.id} className="border-b border-white/3 hover:bg-white/2 transition-colors">
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                                  style={{ background: 'linear-gradient(135deg, #f97316, #ea580c)' }}>
                                  {w.display_name[0]}
                                </div>
                                <div>
                                  <div className="text-slate-200 text-xs">{w.display_name}</div>
                                  <div className="text-slate-600 text-xs font-mono">{w.worker_no}</div>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-slate-500 text-xs">
                              {w.product_line ?? '—'}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span className={cn(
                                'text-sm font-bold',
                                batches > 0 ? 'text-orange-400' : 'text-slate-600'
                              )}>{batches}</span>
                            </td>
                            <td className="px-4 py-3 text-center text-slate-400 text-xs">
                              {weight > 0 ? weight.toFixed(1) : '—'}
                            </td>
                            <td className="px-4 py-3 text-center text-slate-600 text-xs">
                              {s?.last_action
                                ? new Date(s.last_action).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
                                : '—'}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <div className="flex items-center justify-center gap-1.5">
                                <span className={cn(
                                  'w-1.5 h-1.5 rounded-full',
                                  isOnline ? 'bg-green-400 animate-pulse' : 'bg-slate-700'
                                )} />
                                <span className={cn(
                                  'text-xs',
                                  isOnline ? 'text-green-400' : 'text-slate-600'
                                )}>
                                  {isOnline ? '活跃' : '离线'}
                                </span>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <button
                                onClick={() => setQrWorker({ no: w.worker_no, name: w.display_name })}
                                className="text-slate-500 hover:text-orange-400 transition-colors p-1">
                                <QrCode size={14} />
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* 工人操作台入口提示 */}
      <div className="bg-orange-500/5 border border-orange-500/20 rounded-xl p-4 flex items-center gap-3">
        <QrCode size={16} className="text-orange-400 shrink-0" />
        <div className="flex-1">
          <p className="text-sm text-slate-300">工人操作台地址</p>
          <p className="text-xs text-slate-500 mt-0.5 font-mono">
            {typeof window !== 'undefined' ? window.location.origin : ''}/w
          </p>
        </div>
        <a href="/w" target="_blank"
          className="text-xs text-orange-400 hover:text-orange-300 border border-orange-500/30 px-3 py-1.5 rounded-lg transition-all">
          预览
        </a>
      </div>
    </div>
  )
}
