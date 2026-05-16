'use client'

import { useEffect, useState, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { Activity, AlertTriangle, TrendingUp, Package, Clock, Zap } from 'lucide-react'
import { supabase } from '@/lib/supabase'

const PRODUCT_LINES = ['上轴', '下轴', '抬牙轴', '送布轴', '压杆', '针杆', '小产品']

const STAGE_GROUPS: Record<number, string> = {
  1: '原料入库', 2: '五金加工', 3: '五金加工',
  4: '称重', 5: '热处理', 6: '热处理',
  7: '称重', 8: '磨床', 9: '磨床',
  10: '称重', 11: '校直检验', 12: '检验',
  13: '待出库', 14: '待出库',
}

type TransferRow = {
  id: string
  created_at: string
  stage_name: string
  weight_in: number | null
  scrap_rate: number | null
  scan_index: number
  orders: { product_model: string; order_no: string } | null
  worker_profiles: { display_name: string } | null
}

type AnomalyRow = {
  id: string
  description: string
  severity: string
  created_at: string
}

type OrderRow = {
  id: string
  status: string
  product_model: string
  quantity: number
  unit_price: number
  created_at: string
  is_urgent: boolean
  order_progress: { current_stage: number }[] | null
}

function RingChart({ pct }: { pct: number }) {
  const r = 54
  const circ = 2 * Math.PI * r
  const dash = (pct / 100) * circ

  return (
    <div className="relative flex items-center justify-center">
      <svg width="140" height="140" className="-rotate-90">
        <circle cx="70" cy="70" r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="10" />
        <circle cx="70" cy="70" r={r} fill="none"
          stroke="url(#ringGrad)" strokeWidth="10"
          strokeDasharray={`${dash} ${circ - dash}`}
          strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 1s ease' }}
        />
        <defs>
          <linearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#f97316" />
            <stop offset="100%" stopColor="#fb923c" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute text-center">
        <div className="text-2xl font-bold text-slate-100">{pct.toFixed(0)}%</div>
        <div className="text-xs text-slate-500">完成率</div>
      </div>
    </div>
  )
}

export default function ScreenPage() {
  const [time, setTime] = useState(new Date())
  const [orders, setOrders] = useState<OrderRow[]>([])
  const [transfers, setTransfers] = useState<TransferRow[]>([])
  const [anomalies, setAnomalies] = useState<AnomalyRow[]>([])

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  const fetchAll = useCallback(async () => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const sevenDaysAgo = new Date(today)
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6)

    const [ordersRes, transfersRes, anomaliesRes] = await Promise.all([
      supabase
        .from('orders')
        .select('id, status, product_model, quantity, unit_price, created_at, is_urgent, order_progress(current_stage)')
        .order('created_at', { ascending: false }),
      supabase
        .from('process_transfers')
        .select('id, created_at, stage_name, weight_in, scrap_rate, scan_index, orders(product_model, order_no), worker_profiles:worker_id(display_name)')
        .order('created_at', { ascending: false })
        .limit(20),
      supabase
        .from('anomalies')
        .select('id, description, severity, created_at')
        .eq('is_resolved', false)
        .order('created_at', { ascending: false })
        .limit(6),
    ])

    if (ordersRes.data) setOrders(ordersRes.data as OrderRow[])
    if (transfersRes.data) setTransfers(transfersRes.data as unknown as TransferRow[])
    if (anomaliesRes.data) setAnomalies(anomaliesRes.data)
  }, [])

  useEffect(() => {
    fetchAll()
    const ch = supabase.channel('screen-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, fetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'process_transfers' }, fetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'anomalies' }, fetchAll)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [fetchAll])

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayOrders = orders.filter(o => new Date(o.created_at) >= today)
  const todayRevenue = todayOrders.reduce((s, o) => s + o.quantity * (o.unit_price ?? 0), 0)
  const targetRevenue = 150000
  const pct = Math.min((todayRevenue / targetRevenue) * 100, 100)

  const inProduction = orders.filter(o => o.status === 'in_production')
  const todayCompleted = orders.filter(o => o.status === 'completed' && new Date(o.created_at) >= today)

  // 各产品线在制/完成统计
  const productLineStats = PRODUCT_LINES.map(name => {
    const inProd = inProduction.filter(o => o.product_model.startsWith(name.replace(/[AB]$/, ''))).length
    const completed = orders.filter(o =>
      o.status === 'completed' &&
      o.product_model.startsWith(name.replace(/[AB]$/, '')) &&
      new Date(o.created_at) >= today
    ).length
    return { name, inProd, completed }
  })
  const maxProdVal = Math.max(...productLineStats.map(p => p.inProd + p.completed), 1)

  // 损耗率（取最近有 scrap_rate 的记录，按产品线聚合）
  const scrapByLine: Record<string, number[]> = {}
  for (const t of transfers) {
    if (t.scrap_rate !== null && t.orders?.product_model) {
      const line = PRODUCT_LINES.find(l => t.orders!.product_model.startsWith(l)) ?? '其他'
      if (!scrapByLine[line]) scrapByLine[line] = []
      scrapByLine[line].push(t.scrap_rate * 100)
    }
  }
  const scrapStats = PRODUCT_LINES.map(name => ({
    name,
    scrap: scrapByLine[name]?.length
      ? scrapByLine[name].reduce((a, b) => a + b, 0) / scrapByLine[name].length
      : 0,
  })).sort((a, b) => b.scrap - a.scrap)

  // 近7日产值（按天聚合已完成订单）
  const weeklyMap: Record<string, number> = {}
  for (let i = 6; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    weeklyMap[d.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })] = 0
  }
  for (const o of orders) {
    if (o.status === 'completed') {
      const d = new Date(o.created_at)
      const key = d.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })
      if (key in weeklyMap) weeklyMap[key] += o.quantity * (o.unit_price ?? 0)
    }
  }
  const weeklyOutput = Object.entries(weeklyMap).map(([day, value]) => ({ day, value }))
  const maxOutput = Math.max(...weeklyOutput.map(d => d.value), 1)

  return (
    <div className="min-h-screen p-4 flex flex-col gap-4"
      style={{ background: 'radial-gradient(ellipse at top, #0f1923 0%, #0d1117 60%)' }}>

      {/* Header */}
      <div className="flex items-center justify-between px-2">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #f97316, #ea580c)' }}>
            <Zap size={16} className="text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-100 tracking-wide">智排云 · 生产实时看板</h1>
            <p className="text-xs text-slate-600">新鄞工缝纫机科技 · 宁波</p>
          </div>
        </div>
        <div className="text-right">
          <div className="text-xl font-mono text-orange-400">
            {time.toLocaleTimeString('zh-CN', { hour12: false })}
          </div>
          <div className="text-xs text-slate-600">
            {time.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}
          </div>
        </div>
      </div>

      <div className="h-px" style={{ background: 'linear-gradient(90deg, transparent, rgba(249,115,22,0.4), transparent)' }} />

      <div className="flex-1 grid grid-cols-12 gap-4">

        {/* 左列 */}
        <div className="col-span-3 flex flex-col gap-4">
          {/* 今日产值 */}
          <div className="bg-[#161b22]/80 rounded-xl border border-white/5 p-4 flex flex-col items-center">
            <div className="text-xs text-slate-500 mb-3 self-start flex items-center gap-1.5">
              <TrendingUp size={12} className="text-orange-400" />
              今日产值
            </div>
            <RingChart pct={pct} />
            <div className="mt-3 text-center">
              <div className="text-2xl font-bold text-slate-100">
                ¥{(todayRevenue / 10000).toFixed(2)}<span className="text-sm text-slate-500 ml-1">万</span>
              </div>
              <div className="text-xs text-slate-600 mt-0.5">目标 ¥{(targetRevenue / 10000).toFixed(0)}万</div>
            </div>
          </div>

          {/* 关键指标 */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: '在产订单', value: String(inProduction.length), icon: Package, color: 'text-blue-400' },
              { label: '今日完成', value: String(todayCompleted.length), icon: Activity, color: 'text-green-400' },
              { label: '未处理预警', value: String(anomalies.length), icon: AlertTriangle, color: 'text-red-400' },
              { label: '加急订单', value: String(orders.filter(o => o.is_urgent && o.status === 'in_production').length), icon: Clock, color: 'text-yellow-400' },
            ].map((item, i) => (
              <div key={i} className="bg-[#161b22]/80 rounded-xl border border-white/5 p-3">
                <item.icon size={14} className={cn('mb-2', item.color)} />
                <div className="text-xl font-bold text-slate-100">{item.value}</div>
                <div className="text-xs text-slate-600 mt-0.5">{item.label}</div>
              </div>
            ))}
          </div>

          {/* 损耗率排行 */}
          <div className="bg-[#161b22]/80 rounded-xl border border-white/5 p-4 flex-1">
            <div className="text-xs text-slate-500 mb-3 flex items-center gap-1.5">
              <AlertTriangle size={12} className="text-yellow-400" />
              今日损耗率（实时）
            </div>
            <div className="space-y-2">
              {scrapStats.map((p, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-xs text-slate-500 w-12 shrink-0">{p.name}</span>
                  <div className="flex-1 h-4 bg-white/5 rounded overflow-hidden">
                    <div className="h-full rounded transition-all duration-700"
                      style={{
                        width: `${Math.min((p.scrap / 3) * 100, 100)}%`,
                        background: p.scrap > 1.5
                          ? 'linear-gradient(90deg, rgba(239,68,68,0.7), rgba(239,68,68,0.4))'
                          : p.scrap > 1.0
                            ? 'linear-gradient(90deg, rgba(234,179,8,0.7), rgba(234,179,8,0.4))'
                            : 'linear-gradient(90deg, rgba(34,197,94,0.7), rgba(34,197,94,0.4))'
                      }} />
                  </div>
                  <span className={cn(
                    'text-xs w-10 text-right shrink-0',
                    p.scrap > 1.5 ? 'text-red-400' : p.scrap > 1.0 ? 'text-yellow-400' : p.scrap > 0 ? 'text-green-400' : 'text-slate-700'
                  )}>{p.scrap > 0 ? `${p.scrap.toFixed(1)}%` : '—'}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 中列 */}
        <div className="col-span-6 flex flex-col gap-4">
          {/* 各产品线在制数量 */}
          <div className="bg-[#161b22]/80 rounded-xl border border-white/5 p-4">
            <div className="text-xs text-slate-500 mb-4 flex items-center gap-1.5">
              <Activity size={12} className="text-orange-400" />
              各产品线在制 / 今日完成
            </div>
            <div className="space-y-3">
              {productLineStats.map((p, i) => {
                const inProdPct = (p.inProd / maxProdVal) * 100
                const completedPct = (p.completed / maxProdVal) * 100
                return (
                  <div key={i} className="flex items-center gap-3">
                    <span className="text-xs text-slate-400 w-14 shrink-0">{p.name}</span>
                    <div className="flex-1 flex gap-1 h-6">
                      {inProdPct > 0 && (
                        <div className="rounded overflow-hidden transition-all duration-700"
                          style={{
                            width: `${inProdPct}%`,
                            background: 'linear-gradient(90deg, rgba(249,115,22,0.7), rgba(249,115,22,0.4))'
                          }} />
                      )}
                      {completedPct > 0 && (
                        <div className="rounded overflow-hidden transition-all duration-700"
                          style={{
                            width: `${completedPct}%`,
                            background: 'linear-gradient(90deg, rgba(34,197,94,0.5), rgba(34,197,94,0.2))'
                          }} />
                      )}
                      {inProdPct === 0 && completedPct === 0 && (
                        <div className="flex-1 h-full bg-white/3 rounded" />
                      )}
                    </div>
                    <div className="flex gap-3 text-xs shrink-0">
                      <span className={p.inProd > 0 ? 'text-orange-400' : 'text-slate-700'}>{p.inProd} 在制</span>
                      <span className={p.completed > 0 ? 'text-green-400' : 'text-slate-700'}>{p.completed} 完成</span>
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="flex gap-4 mt-3 pt-3 border-t border-white/5">
              <div className="flex items-center gap-1.5 text-xs text-slate-600">
                <div className="w-3 h-2 rounded-sm bg-orange-400/60" />在制中
              </div>
              <div className="flex items-center gap-1.5 text-xs text-slate-600">
                <div className="w-3 h-2 rounded-sm bg-green-400/50" />今日完成
              </div>
            </div>
          </div>

          {/* 近7日产值趋势 */}
          <div className="bg-[#161b22]/80 rounded-xl border border-white/5 p-4 flex-1">
            <div className="text-xs text-slate-500 mb-4 flex items-center gap-1.5">
              <TrendingUp size={12} className="text-orange-400" />
              近7日产值趋势
            </div>
            <div className="flex items-end gap-2 h-32">
              {weeklyOutput.map((d, i) => {
                const h = Math.max((d.value / maxOutput) * 100, d.value > 0 ? 5 : 2)
                const isToday = i === weeklyOutput.length - 1
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1">
                    <div className="text-xs text-slate-600">
                      {d.value > 0 ? `¥${(d.value / 10000).toFixed(0)}w` : ''}
                    </div>
                    <div className="w-full rounded-t transition-all duration-700 relative"
                      style={{
                        height: `${h}%`,
                        background: isToday
                          ? 'linear-gradient(180deg, #f97316, rgba(249,115,22,0.3))'
                          : 'linear-gradient(180deg, rgba(59,130,246,0.6), rgba(59,130,246,0.2))',
                        minHeight: '4px'
                      }}>
                      {isToday && d.value > 0 && (
                        <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" />
                      )}
                    </div>
                    <div className={cn('text-xs', isToday ? 'text-orange-400' : 'text-slate-600')}>
                      {d.day}
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="mt-3 pt-3 border-t border-white/5 flex items-center justify-between text-xs text-slate-600">
              <span>7日均值：¥{(weeklyOutput.reduce((s, d) => s + d.value, 0) / 7 / 10000).toFixed(1)}万</span>
              <span className="text-orange-400">目标：¥15万/天</span>
            </div>
          </div>
        </div>

        {/* 右列 */}
        <div className="col-span-3 flex flex-col gap-4">
          {/* 实时流转 */}
          <div className="bg-[#161b22]/80 rounded-xl border border-white/5 p-4 flex-1">
            <div className="text-xs text-slate-500 mb-3 flex items-center gap-1.5">
              <Activity size={12} className="text-green-400" />
              实时流转记录
              <span className="ml-auto w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            </div>
            {transfers.length === 0 ? (
              <div className="flex items-center justify-center h-24 text-slate-700 text-xs">暂无流转记录</div>
            ) : (
              <div className="space-y-2.5 overflow-hidden">
                {transfers.slice(0, 6).map((t, i) => (
                  <div key={t.id} className={cn(
                    'flex gap-2 text-xs transition-all',
                    i === 0 ? 'opacity-100' : i === 1 ? 'opacity-80' : `opacity-${Math.max(30, 80 - i * 12)}`
                  )}>
                    <span className="text-slate-600 shrink-0 font-mono">
                      {new Date(t.created_at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-slate-400 truncate">{t.stage_name}</div>
                      <div className="flex items-center gap-1 text-slate-600 mt-0.5">
                        <span className="text-orange-400/70">{t.orders?.product_model ?? '—'}</span>
                        {t.worker_profiles?.display_name && (
                          <><span>·</span><span>{t.worker_profiles.display_name}</span></>
                        )}
                        {t.weight_in && (
                          <><span>·</span><span className="text-blue-400/70">{t.weight_in.toFixed(1)}kg</span></>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 预警列表 */}
          <div className="bg-[#161b22]/80 rounded-xl border border-red-500/10 p-4">
            <div className="text-xs text-slate-500 mb-3 flex items-center gap-1.5">
              <AlertTriangle size={12} className="text-red-400" />
              未处理预警
              {anomalies.length > 0 && (
                <span className="ml-auto bg-red-500/20 text-red-400 text-xs px-1.5 py-0.5 rounded-full">
                  {anomalies.length}
                </span>
              )}
            </div>
            {anomalies.length === 0 ? (
              <div className="flex items-center justify-center py-4 text-slate-700 text-xs">暂无预警</div>
            ) : (
              <div className="space-y-2">
                {anomalies.slice(0, 4).map((a) => (
                  <div key={a.id} className={cn(
                    'flex items-start gap-2 p-2 rounded-lg text-xs',
                    a.severity === 'critical' ? 'bg-red-500/8' : 'bg-yellow-500/8'
                  )}>
                    <div className={cn(
                      'w-1 h-1 rounded-full mt-1.5 shrink-0',
                      a.severity === 'critical' ? 'bg-red-400' : 'bg-yellow-400'
                    )} />
                    <div className="flex-1">
                      <div className="text-slate-400">{a.description}</div>
                      <div className="text-slate-700 mt-0.5">
                        {new Date(a.created_at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
