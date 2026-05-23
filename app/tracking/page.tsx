'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { cn, STAGE_NAMES, STATUS_LABELS } from '@/lib/utils'
import { CheckCircle2, Clock, AlertTriangle, Package, ArrowLeft, Search } from 'lucide-react'
import { supabase } from '@/lib/supabase'

type Order = {
  id: string
  order_no: string
  customer_name: string
  product_model: string
  product_spec: string
  quantity: number
  unit_price: number
  delivery_date: string
  status: string
  is_urgent: boolean
  created_at: string
}

type OrderProgress = {
  id: string
  order_id: string
  current_stage: number
  current_stage_name: string
  updated_at: string
}

type WeighRecord = {
  scan_index: number
  weight_in: number | null
  created_at: string
}

const WEIGH_STAGES = [1, 4, 7, 10, 13]
const WEIGH_LABELS: Record<number, string> = {
  1: '入料',
  4: '五金产出',
  7: '热处理产出',
  10: '磨床产出',
  13: '入库',
}
const LOSS_LABELS = ['五金加工损耗', '热处理损耗', '磨床损耗', '校直检验损耗']

type OrderListItem = {
  id: string
  order_no: string
  customer_name: string
  product_model: string
  quantity: number
  status: string
  is_urgent: boolean
  delivery_date: string
  order_progress: { current_stage: number }[] | null
}

function TrackingContent() {
  const searchParams = useSearchParams()
  const orderId = searchParams.get('id')

  // ── 无 id：显示在产订单列表 ──────────────────────────────────────
  const [orderList, setOrderList] = useState<OrderListItem[]>([])
  const [listLoading, setListLoading] = useState(false)
  const [listSearch, setListSearch] = useState('')

  useEffect(() => {
    if (orderId) return
    setListLoading(true)
    supabase
      .from('orders')
      .select('id, order_no, customer_name, product_model, quantity, status, is_urgent, delivery_date, order_progress(current_stage)')
      .in('status', ['pending', 'in_production'])
      .order('is_urgent', { ascending: false })
      .order('delivery_date', { ascending: true })
      .then(({ data }) => {
        setOrderList(data ?? [])
        setListLoading(false)
      })
  }, [orderId])

  const [order, setOrder] = useState<Order | null>(null)
  const [progress, setProgress] = useState<OrderProgress | null>(null)
  const [weighRecords, setWeighRecords] = useState<WeighRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    if (!orderId) return
    fetchData()

    const channel = supabase.channel(`tracking-${orderId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_progress' }, fetchData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'process_transfers' }, fetchData)
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [orderId])

  async function fetchData() {
    const [orderRes, progressRes, transfersRes] = await Promise.all([
      supabase.from('orders').select('*').eq('id', orderId!).single(),
      supabase.from('order_progress').select('*').eq('order_id', orderId!).single(),
      supabase.from('process_transfers')
        .select('scan_index, weight_in, created_at')
        .eq('order_id', orderId!)
        .in('scan_index', WEIGH_STAGES)
        .order('scan_index', { ascending: true }),
    ])

    if (orderRes.error || !orderRes.data) {
      setNotFound(true)
    } else {
      setOrder(orderRes.data)
      setProgress(progressRes.data ?? null)
      setWeighRecords(transfersRes.data ?? [])
    }
    setLoading(false)
  }

  // ── 无 id：渲染订单列表 ──────────────────────────────────────────
  if (!orderId) {
    const filtered = orderList.filter(o =>
      !listSearch ||
      o.order_no.toLowerCase().includes(listSearch.toLowerCase()) ||
      o.customer_name.toLowerCase().includes(listSearch.toLowerCase()) ||
      o.product_model.toLowerCase().includes(listSearch.toLowerCase())
    )
    return (
      <div className="p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-slate-100">生产追踪</h1>
            <p className="text-sm text-slate-500 mt-0.5">选择订单查看实时进度</p>
          </div>
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" />
            <input
              value={listSearch}
              onChange={e => setListSearch(e.target.value)}
              placeholder="搜索订单号 / 客户 / 型号"
              className="pl-8 pr-3 py-2 text-xs bg-[#161b22] border border-white/8 rounded-lg text-slate-300 placeholder-slate-600 focus:outline-none focus:border-orange-500/40 w-56"
            />
          </div>
        </div>

        {listLoading ? (
          <div className="flex items-center justify-center h-40 text-slate-600 text-sm">加载中...</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 gap-2 text-slate-600 text-sm">
            <Package size={24} className="opacity-30" />
            {listSearch ? '没有匹配的订单' : '暂无在产订单'}
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(o => {
              const stage = o.order_progress?.[0]?.current_stage ?? 0
              const daysLeft = Math.ceil((new Date(o.delivery_date).getTime() - Date.now()) / 86400000)
              const s = STATUS_LABELS[o.status] ?? { label: o.status, color: 'text-slate-400 bg-slate-400/10' }
              return (
                <a
                  key={o.id}
                  href={`/tracking?id=${o.id}`}
                  className="flex items-center gap-4 bg-[#161b22] hover:bg-[#1c2128] border border-white/5 hover:border-orange-500/20 rounded-xl p-4 transition-all group"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-mono text-slate-200">{o.order_no}</span>
                      {o.is_urgent && (
                        <span className="text-[10px] text-red-400 bg-red-500/10 border border-red-500/20 px-1.5 py-0.5 rounded-full">加急</span>
                      )}
                      <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full', s.color)}>{s.label}</span>
                    </div>
                    <div className="text-xs text-slate-500">{o.customer_name} · {o.product_model} · {o.quantity.toLocaleString()} 根</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xs text-slate-400 mb-1">工序 {stage}/14</div>
                    <div className={cn(
                      'text-xs',
                      daysLeft <= 0 ? 'text-red-400' : daysLeft <= 3 ? 'text-yellow-400' : 'text-slate-600'
                    )}>
                      {daysLeft > 0 ? `剩 ${daysLeft} 天` : daysLeft === 0 ? '今日交货' : `逾期 ${-daysLeft} 天`}
                    </div>
                  </div>
                  <div className="w-4 h-4 text-slate-700 group-hover:text-orange-400 transition-colors">›</div>
                </a>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-600 text-sm">加载中...</div>
    )
  }

  if (notFound || !order) {
    return (
      <div className="p-6 flex flex-col items-center justify-center h-64 gap-4">
        <p className="text-slate-500 text-sm">订单不存在或已删除</p>
        <a href="/tracking" className="flex items-center gap-1.5 text-xs text-orange-400 hover:text-orange-300">
          <ArrowLeft size={12} /> 返回追踪列表
        </a>
      </div>
    )
  }

  const currentStage = progress?.current_stage ?? 0
  const daysLeft = Math.ceil((new Date(order.delivery_date).getTime() - Date.now()) / 86400000)

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <a href="/orders" className="text-slate-600 hover:text-slate-400 transition-colors">
            <ArrowLeft size={16} />
          </a>
          <div>
            <h1 className="text-xl font-semibold text-slate-100">生产追踪</h1>
            <p className="text-sm text-slate-500 mt-0.5">订单 {order.order_no}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {order.is_urgent && (
            <span className="flex items-center gap-1.5 text-xs text-red-400 bg-red-500/10 border border-red-500/20 px-3 py-1.5 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
              加急订单
            </span>
          )}
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            实时追踪
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {/* 订单信息 */}
        <div className="bg-[#161b22] rounded-xl border border-white/5 p-4">
          <h2 className="text-xs text-slate-500 mb-3 flex items-center gap-1.5">
            <Package size={12} className="text-orange-400" />
            订单信息
          </h2>
          <div className="space-y-2.5 text-sm">
            {[
              ['客户', order.customer_name],
              ['产品型号', order.product_spec ? `${order.product_model} · ${order.product_spec}` : order.product_model],
              ['数量', `${order.quantity.toLocaleString()} 根`],
              ['金额', `¥${(order.quantity * order.unit_price).toLocaleString()}`],
              ['交期', order.delivery_date],
              ['剩余', daysLeft > 0 ? `${daysLeft} 天` : daysLeft === 0 ? '今日交货' : `逾期 ${-daysLeft} 天`],
            ].map(([k, v], i) => (
              <div key={i} className="flex justify-between">
                <span className="text-slate-600">{k}</span>
                <span className={cn(
                  'text-xs font-mono',
                  k === '剩余' && daysLeft <= 0 ? 'text-red-400' :
                  k === '剩余' && daysLeft <= 3 ? 'text-yellow-400' : 'text-slate-300'
                )}>{v}</span>
              </div>
            ))}
          </div>
        </div>

        {/* 14步进度 */}
        <div className="col-span-2 bg-[#161b22] rounded-xl border border-white/5 p-4">
          <h2 className="text-xs text-slate-500 mb-4 flex items-center gap-1.5">
            <Clock size={12} className="text-orange-400" />
            工序进度 {currentStage}/14
          </h2>
          {currentStage === 0 ? (
            <div className="flex items-center justify-center h-24 text-slate-600 text-xs">
              订单尚未开始生产
            </div>
          ) : (
            <div className="grid grid-cols-7 gap-2">
              {Array.from({ length: 14 }).map((_, i) => {
                const idx = i + 1
                const done = idx < currentStage
                const current = idx === currentStage
                return (
                  <div key={i} className={cn(
                    'flex flex-col items-center gap-1 p-2 rounded-lg border text-center transition-all',
                    done ? 'bg-orange-500/8 border-orange-500/20' :
                      current ? 'bg-blue-500/10 border-blue-500/30 glow' :
                        'bg-white/2 border-white/5'
                  )}>
                    <div className={cn(
                      'w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold',
                      done ? 'bg-orange-500/20 text-orange-400' :
                        current ? 'bg-blue-500/20 text-blue-400' :
                          'bg-white/5 text-slate-600'
                    )}>
                      {done ? '✓' : idx}
                    </div>
                    <div className={cn(
                      'text-[9px] leading-tight',
                      done ? 'text-slate-400' : current ? 'text-blue-400' : 'text-slate-700'
                    )}>
                      {STAGE_NAMES[idx].replace('称重员', '').replace('-', '\n')}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* 当前工序说明 */}
      {currentStage > 0 && (
        <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-4 flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400 text-sm font-bold shrink-0">
            {currentStage}
          </div>
          <div>
            <div className="text-sm text-blue-400 font-medium">{STAGE_NAMES[currentStage]}</div>
            <div className="text-xs text-slate-500 mt-0.5">
              当前工序 · {progress?.updated_at
                ? new Date(progress.updated_at).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                : '进行中'}
            </div>
          </div>
          <div className="ml-auto text-xs text-slate-600">
            完成度 {Math.round((currentStage / 14) * 100)}%
          </div>
        </div>
      )}

      {/* 重量守恒追踪 */}
      <div className="bg-[#161b22] rounded-xl border border-white/5 p-4">
        <h2 className="text-xs text-slate-500 mb-4 flex items-center gap-1.5">
          <AlertTriangle size={12} className="text-yellow-400" />
          原料重量守恒追踪
        </h2>
        {(() => {
          const weighMap: Record<number, number> = {}
          for (const r of weighRecords) {
            if (r.weight_in !== null) weighMap[r.scan_index] = r.weight_in
          }
          const maxWeight = Math.max(...Object.values(weighMap), 1)
          const hasAnyData = Object.keys(weighMap).length > 0

          return (
            <>
              <div className="flex items-end gap-3 h-36">
                {WEIGH_STAGES.map((stageIdx, i) => {
                  const w = weighMap[stageIdx]
                  const reached = currentStage >= stageIdx
                  const heightPct = w ? Math.max((w / maxWeight) * 90, 8) : (reached ? 12 : 8)
                  const prevStage = WEIGH_STAGES[i - 1]
                  const prevW = prevStage ? weighMap[prevStage] : null
                  const lossRate = (w && prevW && prevW > 0) ? ((prevW - w) / prevW * 100) : null
                  const isOverThreshold = lossRate !== null && lossRate > 2

                  return (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1">
                      {w && (
                        <div className="text-xs font-mono text-slate-300 mb-1">{w.toFixed(1)}<span className="text-slate-600 text-[10px]">kg</span></div>
                      )}
                      {lossRate !== null && (
                        <div className={cn('text-[10px] mb-0.5', isOverThreshold ? 'text-red-400' : 'text-green-400')}>
                          {isOverThreshold ? '⚠' : '✓'} -{lossRate.toFixed(1)}%
                        </div>
                      )}
                      <div className="w-full rounded-t transition-all duration-700 relative"
                        style={{
                          height: `${heightPct}%`,
                          background: !reached
                            ? 'rgba(255,255,255,0.04)'
                            : w
                              ? i === 0
                                ? 'rgba(59,130,246,0.7)'
                                : isOverThreshold
                                  ? 'rgba(239,68,68,0.6)'
                                  : i === WEIGH_STAGES.length - 1
                                    ? 'rgba(34,197,94,0.6)'
                                    : 'rgba(249,115,22,0.6)'
                              : 'rgba(255,255,255,0.08)',
                          minHeight: '8px',
                          border: !reached ? '1px dashed rgba(255,255,255,0.08)' : 'none'
                        }}>
                        {!w && reached && (
                          <div className="absolute inset-0 flex items-center justify-center text-[10px] text-slate-600">待称重</div>
                        )}
                        {!reached && (
                          <div className="absolute inset-0 flex items-center justify-center text-[10px] text-slate-700">待录入</div>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-600 text-center leading-tight mt-1">{WEIGH_LABELS[stageIdx]}</div>
                    </div>
                  )
                })}
              </div>
              {hasAnyData ? (
                <div className="mt-3 pt-3 border-t border-white/5 flex items-center justify-between text-xs text-slate-600">
                  <span>入料：{weighMap[1]?.toFixed(1) ?? '—'} kg</span>
                  {weighMap[13] && weighMap[1] && (
                    <span className={cn(
                      (weighMap[1] - weighMap[13]) / weighMap[1] > 0.05 ? 'text-red-400' : 'text-green-400'
                    )}>
                      总损耗 {((weighMap[1] - weighMap[13]) / weighMap[1] * 100).toFixed(1)}%
                    </span>
                  )}
                  <span>入库：{weighMap[13]?.toFixed(1) ?? '—'} kg</span>
                </div>
              ) : (
                <p className="text-xs text-slate-700 mt-3 text-center">重量数据将在工人扫码称重后自动更新</p>
              )}
            </>
          )
        })()}
      </div>
    </div>
  )
}

export default function TrackingPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-64 text-slate-600 text-sm">加载中...</div>}>
      <TrackingContent />
    </Suspense>
  )
}
