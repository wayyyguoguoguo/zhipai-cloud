'use client'

import { useState, useEffect } from 'react'
import { cn, STATUS_LABELS } from '@/lib/utils'
import {
  TrendingUp, TrendingDown, AlertTriangle,
  ClipboardList, Activity, ArrowRight, Clock
} from 'lucide-react'
import { supabase } from '@/lib/supabase'

type Order = {
  id: string
  order_no: string
  customer_name: string
  product_model: string
  quantity: number
  unit_price: number
  status: string
  is_urgent: boolean
  created_at: string
  order_progress: { current_stage: number } | null
}

type Anomaly = {
  id: string
  type: string
  description: string
  severity: string
  is_resolved: boolean
  created_at: string
}

const STAGE_GROUPS: Record<number, string> = {
  1: '原料入库', 2: '五金加工', 3: '五金加工',
  4: '称重', 5: '热处理', 6: '热处理',
  7: '称重', 8: '磨床', 9: '磨床',
  10: '称重', 11: '校直检验', 12: '清洗',
  13: '待出库', 14: '待出库',
}

const STAGE_DISPLAY = ['原料入库', '五金加工', '热处理', '磨床', '校直检验', '清洗', '待出库']

export default function DashboardPage() {
  const [orders, setOrders] = useState<Order[]>([])
  const [anomalies, setAnomalies] = useState<Anomaly[]>([])
  const [loading, setLoading] = useState(true)
  const today = new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })

  useEffect(() => {
    fetchAll()

    const ch1 = supabase.channel('dash-orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, fetchAll)
      .subscribe()
    const ch2 = supabase.channel('dash-anomalies')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'anomalies' }, fetchAll)
      .subscribe()

    return () => {
      supabase.removeChannel(ch1)
      supabase.removeChannel(ch2)
    }
  }, [])

  async function fetchAll() {
    const [ordersRes, anomaliesRes] = await Promise.all([
      supabase.from('orders').select('*, order_progress(current_stage)').order('created_at', { ascending: false }),
      supabase.from('anomalies').select('*').eq('is_resolved', false).order('created_at', { ascending: false }).limit(6),
    ])
    if (!ordersRes.error && ordersRes.data) setOrders(ordersRes.data)
    if (!anomaliesRes.error && anomaliesRes.data) setAnomalies(anomaliesRes.data)
    setLoading(false)
  }

  const inProduction = orders.filter(o => o.status === 'in_production')
  const todayOrders = orders.filter(o => o.created_at?.startsWith(new Date().toISOString().slice(0, 10)))
  const todayRevenue = todayOrders.reduce((sum, o) => sum + o.quantity * o.unit_price, 0)
  const recentOrders = orders.slice(0, 5)

  const stageCounts = STAGE_DISPLAY.map(name => ({
    stage: name,
    count: inProduction.filter(o => STAGE_GROUPS[o.order_progress?.current_stage ?? 0] === name).length,
  }))
  const maxCount = Math.max(...stageCounts.map(s => s.count), 1)

  const stats = [
    {
      label: '今日产值',
      value: `¥${todayRevenue.toLocaleString()}`,
      trend: 'up' as const,
      delta: `${todayOrders.length} 单`,
    },
    {
      label: '在产订单',
      value: String(inProduction.length),
      unit: '单',
      trend: 'up' as const,
      delta: `共 ${orders.length} 单`,
    },
    {
      label: '未处理预警',
      value: String(anomalies.length),
      unit: '条',
      trend: anomalies.length > 0 ? 'down' as const : 'up' as const,
      delta: anomalies.length > 0 ? '需处理' : '正常',
      alert: anomalies.length > 0,
    },
    {
      label: '紧急订单',
      value: String(orders.filter(o => o.is_urgent).length),
      unit: '单',
      trend: 'down' as const,
      delta: '加急',
      alert: orders.some(o => o.is_urgent),
    },
  ]

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-600 text-sm">加载中...</div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-100">生产总览</h1>
          <p className="text-sm text-slate-500 mt-0.5">新鄞工缝纫机科技 · {today}</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
          实时数据
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        {stats.map((s, i) => (
          <div key={i} className={cn(
            'rounded-xl p-4 border transition-all hover:border-orange-500/30',
            s.alert ? 'bg-red-500/5 border-red-500/20' : 'bg-[#161b22] border-white/5'
          )}>
            <div className="flex items-start justify-between mb-3">
              <span className="text-xs text-slate-500">{s.label}</span>
              <span className={cn(
                'text-xs flex items-center gap-0.5',
                s.trend === 'up' ? 'text-green-400' : 'text-red-400'
              )}>
                {s.trend === 'up' ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                {s.delta}
              </span>
            </div>
            <div className="flex items-baseline gap-1">
              <span className={cn('text-2xl font-bold', s.alert ? 'text-red-400' : 'text-slate-100')}>
                {s.value}
              </span>
              {s.unit && <span className="text-xs text-slate-500">{s.unit}</span>}
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-4">
        {/* 工序在制分布 */}
        <div className="col-span-1 bg-[#161b22] rounded-xl border border-white/5 p-4">
          <h2 className="text-sm font-medium text-slate-300 mb-4 flex items-center gap-2">
            <Activity size={14} className="text-orange-400" />
            工序在制分布
          </h2>
          {inProduction.length === 0 ? (
            <div className="text-center text-slate-600 text-xs py-8">暂无在产订单</div>
          ) : (
            <div className="space-y-2.5">
              {stageCounts.map((s, i) => {
                const pct = (s.count / maxCount) * 100
                return (
                  <div key={i} className="flex items-center gap-3">
                    <span className="text-xs text-slate-500 w-16 shrink-0">{s.stage}</span>
                    <div className="flex-1 h-5 bg-white/5 rounded overflow-hidden relative">
                      <div className="h-full rounded transition-all duration-700"
                        style={{
                          width: `${pct}%`,
                          background: i % 2 === 0
                            ? 'linear-gradient(90deg, rgba(249,115,22,0.6), rgba(249,115,22,0.3))'
                            : 'linear-gradient(90deg, rgba(59,130,246,0.6), rgba(59,130,246,0.3))'
                        }} />
                      <span className="absolute right-2 top-0 bottom-0 flex items-center text-xs text-slate-400">
                        {s.count}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* 最近订单 */}
        <div className="col-span-2 bg-[#161b22] rounded-xl border border-white/5 p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-medium text-slate-300 flex items-center gap-2">
              <ClipboardList size={14} className="text-orange-400" />
              最近订单
            </h2>
            <a href="/orders" className="text-xs text-orange-400 hover:text-orange-300 flex items-center gap-1">
              全部 <ArrowRight size={10} />
            </a>
          </div>
          {recentOrders.length === 0 ? (
            <div className="text-center text-slate-600 text-xs py-8">暂无订单数据</div>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-slate-600 border-b border-white/5">
                  <th className="text-left pb-2 font-normal">订单号</th>
                  <th className="text-left pb-2 font-normal">客户</th>
                  <th className="text-left pb-2 font-normal">型号</th>
                  <th className="text-right pb-2 font-normal">数量</th>
                  <th className="text-center pb-2 font-normal">当前工序</th>
                  <th className="text-center pb-2 font-normal">状态</th>
                </tr>
              </thead>
              <tbody>
                {recentOrders.map((o) => {
                  const s = STATUS_LABELS[o.status] ?? { label: o.status, color: 'text-slate-400 bg-slate-400/10' }
                  return (
                    <tr key={o.id} className={cn(
                      'border-b border-white/3 hover:bg-white/3 transition-colors',
                      o.is_urgent && 'bg-red-500/5'
                    )}>
                      <td className="py-2.5 font-mono text-slate-400">
                        {o.is_urgent && <span className="text-red-400 mr-1">●</span>}
                        {o.order_no}
                      </td>
                      <td className="py-2.5 text-slate-300">{o.customer_name}</td>
                      <td className="py-2.5 text-slate-400">{o.product_model}</td>
                      <td className="py-2.5 text-right text-slate-300">{o.quantity.toLocaleString()}</td>
                      <td className="py-2.5 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <div className="flex gap-0.5">
                            {Array.from({ length: 14 }).map((_, j) => (
                              <div key={j} className={cn(
                                'w-1 h-3 rounded-sm',
                                j < (o.order_progress?.current_stage ?? 0) ? 'bg-orange-400' : 'bg-white/10'
                              )} />
                            ))}
                          </div>
                          <span className="text-slate-500 ml-1">{o.order_progress?.current_stage ?? 0}/14</span>
                        </div>
                      </td>
                      <td className="py-2.5 text-center">
                        <span className={cn('px-2 py-0.5 rounded-full text-xs', s.color)}>
                          {s.label}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* 异常预警 */}
      <div className="bg-[#161b22] rounded-xl border border-white/5 p-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-medium text-slate-300 flex items-center gap-2">
            <AlertTriangle size={14} className="text-red-400" />
            异常预警
            {anomalies.length > 0 && (
              <span className="bg-red-500/20 text-red-400 text-xs px-1.5 py-0.5 rounded-full">
                {anomalies.length}
              </span>
            )}
          </h2>
        </div>
        {anomalies.length === 0 ? (
          <div className="text-center text-slate-600 text-sm py-6">暂无异常预警</div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {anomalies.map((a) => (
              <div key={a.id} className={cn(
                'flex items-start gap-3 p-3 rounded-lg border',
                a.severity === 'critical'
                  ? 'bg-red-500/5 border-red-500/20'
                  : 'bg-yellow-500/5 border-yellow-500/20'
              )}>
                <div className={cn(
                  'w-1.5 h-1.5 rounded-full mt-1.5 shrink-0',
                  a.severity === 'critical' ? 'bg-red-400' : 'bg-yellow-400'
                )} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-slate-300 leading-relaxed">{a.description}</p>
                  <div className="flex items-center gap-1 mt-1 text-slate-600 text-xs">
                    <Clock size={10} />
                    {new Date(a.created_at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
                <button
                  onClick={async () => {
                    await supabase.from('anomalies').update({ is_resolved: true }).eq('id', a.id)
                  }}
                  className="text-xs text-slate-600 hover:text-slate-400 shrink-0">
                  处理
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
