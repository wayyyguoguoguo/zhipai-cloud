'use client'

import { useState, useEffect, useCallback } from 'react'
import { cn, STAGE_NAMES, ROLE_LABELS } from '@/lib/utils'
import {
  getStoredWorker, storeWorker, clearWorker, loginWorker,
  type WorkerProfile
} from '@/lib/worker-auth'
import { supabase } from '@/lib/supabase'
import { CheckCircle2, Scale, AlertCircle, ChevronRight, LogOut, RefreshCw } from 'lucide-react'

// 每个 role_type 对应哪些 scan_index 是该角色操作的
const ROLE_SCAN_INDEXES: Record<string, number[]> = {
  weigher:      [1, 4, 7, 10, 13, 14],
  metal_worker: [2, 3],
  heat_worker:  [5, 6],
  grinder:      [8, 9],
  straightener: [11],
  inspector:    [12],
  warehouse:    [13, 14],
}

const WEIGH_INDEXES = new Set([1, 4, 7, 10, 13])
// 收料：工人接收上一工序产出
const RECEIVE_INDEXES = new Set([2, 5, 8])
// 完成：工人完成本工序，无需称重
const COMPLETE_INDEXES = new Set([3, 6, 9, 11, 12])
// 出库
const SHIP_INDEXES = new Set([14])

function getStepColor(scanIndex: number): { bg: string; text: string; border: string; badge: string } {
  if (WEIGH_INDEXES.has(scanIndex)) return {
    bg: 'bg-orange-500/10', text: 'text-orange-400', border: 'border-orange-500/30', badge: 'bg-orange-500/20 text-orange-300'
  }
  if (RECEIVE_INDEXES.has(scanIndex)) return {
    bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/30', badge: 'bg-blue-500/20 text-blue-300'
  }
  if (COMPLETE_INDEXES.has(scanIndex)) return {
    bg: 'bg-green-500/10', text: 'text-green-400', border: 'border-green-500/30', badge: 'bg-green-500/20 text-green-300'
  }
  if (SHIP_INDEXES.has(scanIndex)) return {
    bg: 'bg-purple-500/10', text: 'text-purple-400', border: 'border-purple-500/30', badge: 'bg-purple-500/20 text-purple-300'
  }
  return { bg: 'bg-[#161b22]', text: 'text-slate-300', border: 'border-white/5', badge: 'bg-slate-500/20 text-slate-300' }
}

function getStepTypeLabel(scanIndex: number): string {
  if (WEIGH_INDEXES.has(scanIndex)) return '称重'
  if (RECEIVE_INDEXES.has(scanIndex)) return '收料'
  if (COMPLETE_INDEXES.has(scanIndex)) return '完成'
  if (SHIP_INDEXES.has(scanIndex)) return '出库'
  return '操作'
}

type PendingBatch = {
  order_id: string
  order_no: string
  product_model: string
  customer_name: string
  is_urgent: boolean
  current_stage: number
  next_scan_index: number
  prev_weight: number | null
  batch_id: string | null
  batch_no: string | null
}

type Step = 'list' | 'confirm' | 'weigh' | 'qty' | 'done'

export default function WorkerPage() {
  const [worker, setWorker] = useState<WorkerProfile | null>(null)
  const [loginNo, setLoginNo] = useState('')
  const [loginPin, setLoginPin] = useState('')
  const [loginError, setLoginError] = useState('')
  const [loginLoading, setLoginLoading] = useState(false)

  const [batches, setBatches] = useState<PendingBatch[]>([])
  const [loadingBatches, setLoadingBatches] = useState(false)
  const [step, setStep] = useState<Step>('list')
  const [selected, setSelected] = useState<PendingBatch | null>(null)
  const [weight, setWeight] = useState('')
  const [qty, setQty] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')

  useEffect(() => {
    const stored = getStoredWorker()
    if (stored) setWorker(stored)
  }, [])

  const fetchBatches = useCallback(async (w: WorkerProfile) => {
    setLoadingBatches(true)
    const allowedIndexes = ROLE_SCAN_INDEXES[w.role_type] ?? []
    if (allowedIndexes.length === 0) { setLoadingBatches(false); return }

    // 查询 order_progress，找到 current_stage+1 在该角色操作范围内的订单
    const { data: progressRows } = await supabase
      .from('order_progress')
      .select('order_id, current_stage')
      .in('current_stage', allowedIndexes.map(i => i - 1))

    if (!progressRows || progressRows.length === 0) {
      setBatches([])
      setLoadingBatches(false)
      return
    }

    const orderIds = progressRows.map(r => r.order_id)
    const { data: orders } = await supabase
      .from('orders')
      .select('id, order_no, product_model, customer_name, is_urgent')
      .in('id', orderIds)
      .in('status', ['pending', 'in_production'])

    if (!orders) { setBatches([]); setLoadingBatches(false); return }

    // 对每个订单，找最近一次称重记录作为 prev_weight
    const result: PendingBatch[] = []
    for (const order of orders) {
      const prog = progressRows.find(r => r.order_id === order.id)
      if (!prog) continue
      const nextScan = prog.current_stage + 1
      if (!allowedIndexes.includes(nextScan)) continue

      // 如果是磨床/五金工人，只显示匹配 product_line 的订单
      if (
        (w.role_type === 'metal_worker' || w.role_type === 'grinder') &&
        w.product_line &&
        !order.product_model.startsWith(w.product_line.replace(/[AB]$/, ''))
      ) continue

      // 找上一次称重重量
      let prevWeight: number | null = null
      const prevWeighIndexes = [1, 4, 7, 10].filter(i => i < nextScan)
      if (prevWeighIndexes.length > 0) {
        const lastWeighIdx = Math.max(...prevWeighIndexes)
        const { data: lastWeigh } = await supabase
          .from('process_transfers')
          .select('weight_in')
          .eq('order_id', order.id)
          .eq('scan_index', lastWeighIdx)
          .order('created_at', { ascending: false })
          .limit(1)
          .single()
        prevWeight = lastWeigh?.weight_in ?? null
      }

      // 找关联批次
      const { data: alloc } = await supabase
        .from('material_allocations')
        .select('batch_id, material_batches(batch_no)')
        .eq('order_id', order.id)
        .limit(1)
        .single()

      result.push({
        order_id: order.id,
        order_no: order.order_no,
        product_model: order.product_model,
        customer_name: order.customer_name,
        is_urgent: order.is_urgent,
        current_stage: prog.current_stage,
        next_scan_index: nextScan,
        prev_weight: prevWeight,
        batch_id: alloc?.batch_id ?? null,
        batch_no: (alloc?.material_batches as unknown as { batch_no: string } | null)?.batch_no ?? null,
      })
    }

    // 加急订单排前面
    result.sort((a, b) => (b.is_urgent ? 1 : 0) - (a.is_urgent ? 1 : 0))
    setBatches(result)
    setLoadingBatches(false)
  }, [])

  useEffect(() => {
    if (worker) fetchBatches(worker)
  }, [worker, fetchBatches])

  async function handleLogin() {
    if (!loginNo || !loginPin) return
    setLoginLoading(true)
    setLoginError('')
    const result = await loginWorker(loginNo, loginPin)
    setLoginLoading(false)
    if ('error' in result) {
      setLoginError(result.error)
    } else {
      setWorker(result.worker)
    }
  }

  function handleSelect(b: PendingBatch) {
    setSelected(b)
    setWeight('')
    setQty('')
    setSubmitError('')
    setStep('confirm')
  }

  function handleConfirm() {
    if (!selected) return
    if (WEIGH_INDEXES.has(selected.next_scan_index)) {
      setStep('weigh')
    } else if (selected.next_scan_index === 13) {
      setStep('qty')
    } else {
      setStep('weigh')
    }
  }

  async function handleSubmit() {
    if (!selected || !worker) return
    setSubmitting(true)
    setSubmitError('')

    const isWeighStep = WEIGH_INDEXES.has(selected.next_scan_index)
    const isWarehouseIn = selected.next_scan_index === 13

    const actionMap: Record<number, string> = {
      1: 'weigh', 4: 'weigh', 7: 'weigh', 10: 'weigh', 13: 'weigh',
      2: 'receive', 5: 'receive', 8: 'receive',
      3: 'complete', 6: 'complete', 9: 'complete', 11: 'complete', 12: 'complete',
      14: 'ship',
    }

    const transferPayload = {
      order_id: selected.order_id,
      batch_id: selected.batch_id,
      scan_index: selected.next_scan_index,
      stage_name: STAGE_NAMES[selected.next_scan_index],
      role_type: worker.role_type,
      worker_id: worker.id,
      weight_in: isWeighStep && weight ? parseFloat(weight) : null,
      weight_out: selected.prev_weight,
      qty_in: isWarehouseIn && qty ? parseInt(qty) : null,
      action: actionMap[selected.next_scan_index] ?? 'complete',
      is_confirmed: true,
    }

    const { error: transferError } = await supabase
      .from('process_transfers')
      .insert(transferPayload)

    if (transferError) {
      setSubmitError('提交失败：' + transferError.message)
      setSubmitting(false)
      return
    }

    // 更新 order_progress
    const newStage = selected.next_scan_index
    const { error: progressError } = await supabase
      .from('order_progress')
      .update({
        current_stage: newStage,
        current_stage_name: STAGE_NAMES[newStage],
        updated_at: new Date().toISOString(),
        ...(newStage === 1 ? { started_at: new Date().toISOString() } : {}),
        ...(newStage === 14 ? { completed_at: new Date().toISOString() } : {}),
      })
      .eq('order_id', selected.order_id)

    if (progressError) {
      setSubmitError('进度更新失败：' + progressError.message)
      setSubmitting(false)
      return
    }

    // 如果是出库（14），更新订单状态为 completed
    if (newStage === 14) {
      await supabase.from('orders').update({ status: 'completed' }).eq('id', selected.order_id)
    }

    setSubmitting(false)
    setStep('done')
    fetchBatches(worker)
  }

  function handleReset() {
    setStep('list')
    setSelected(null)
    setWeight('')
    setQty('')
    setSubmitError('')
  }

  // ── 登录界面 ──
  if (!worker) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 py-12">
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-6"
          style={{ background: 'linear-gradient(135deg, #f97316, #ea580c)' }}>
          <span className="text-white text-xl font-bold">智</span>
        </div>
        <h1 className="text-xl font-bold text-slate-100 mb-1">工人操作台</h1>
        <p className="text-sm text-slate-500 mb-8">新鄞工缝纫机科技</p>

        <div className="w-full max-w-xs space-y-4">
          <div>
            <label className="text-xs text-slate-500 mb-1.5 block">工号</label>
            <input
              type="text"
              placeholder="如 W001"
              value={loginNo}
              onChange={e => setLoginNo(e.target.value.toUpperCase())}
              className="w-full px-4 py-3 text-base bg-[#161b22] border border-white/10 rounded-xl text-slate-200 placeholder-slate-600 focus:outline-none focus:border-orange-500/60"
            />
          </div>
          <div>
            <label className="text-xs text-slate-500 mb-1.5 block">PIN码（4位数字）</label>
            <input
              type="password"
              inputMode="numeric"
              maxLength={4}
              placeholder="••••"
              value={loginPin}
              onChange={e => setLoginPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
              className="w-full px-4 py-3 text-base bg-[#161b22] border border-white/10 rounded-xl text-slate-200 placeholder-slate-600 focus:outline-none focus:border-orange-500/60 tracking-widest text-center text-2xl"
            />
          </div>
          {loginError && <p className="text-xs text-red-400 text-center">{loginError}</p>}
          <button
            onClick={handleLogin}
            disabled={loginLoading || loginNo.length < 2 || loginPin.length < 4}
            className="w-full py-3.5 rounded-xl text-white font-medium text-base transition-all disabled:opacity-40"
            style={{ background: 'linear-gradient(135deg, #f97316, #ea580c)' }}>
            {loginLoading ? '验证中...' : '登录'}
          </button>
          <p className="text-xs text-slate-600 text-center">初始PIN：0000，请联系管理员修改</p>
        </div>
      </div>
    )
  }

  // ── 已登录：工序操作界面 ──
  return (
    <div className="min-h-screen flex flex-col items-center pt-6 px-4 pb-10">
      {/* 工人身份卡 */}
      <div className="w-full max-w-sm mb-5">
        <div className="bg-[#161b22] rounded-2xl border border-white/5 p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0"
            style={{ background: 'linear-gradient(135deg, #f97316, #ea580c)' }}>
            {worker.display_name[0]}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-slate-200">{worker.display_name}</div>
            <div className="text-xs text-slate-500">
              {ROLE_LABELS[worker.role_type]}
              {worker.product_line && <span className="ml-1 text-orange-400/70">· {worker.product_line}</span>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => fetchBatches(worker)}
              className="text-slate-600 hover:text-slate-400 transition-colors p-1">
              <RefreshCw size={14} />
            </button>
            <button onClick={() => { clearWorker(); setWorker(null) }}
              className="text-slate-600 hover:text-red-400 transition-colors p-1">
              <LogOut size={14} />
            </button>
          </div>
        </div>
      </div>

      <div className="w-full max-w-sm">

        {/* 待处理列表 */}
        {step === 'list' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-sm font-medium text-slate-300">待处理批次</h2>
              <span className="text-xs text-slate-600">{batches.length} 条</span>
            </div>

            {loadingBatches ? (
              <div className="flex items-center justify-center py-12 text-slate-600 text-sm gap-2">
                <div className="w-4 h-4 border-2 border-slate-600 border-t-orange-400 rounded-full animate-spin" />
                加载中...
              </div>
            ) : batches.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <CheckCircle2 size={32} className="text-slate-700" />
                <p className="text-slate-600 text-sm">暂无待处理批次</p>
                <button onClick={() => fetchBatches(worker)}
                  className="text-xs text-orange-400 hover:text-orange-300">
                  刷新
                </button>
              </div>
            ) : (
              batches.map((b, idx) => {
                const stepColor = getStepColor(b.next_scan_index)
                const typeLabel = getStepTypeLabel(b.next_scan_index)
                return (
                  <button key={`${b.order_id}-${idx}`}
                    onClick={() => handleSelect(b)}
                    className={cn(
                      'w-full text-left rounded-2xl border p-4 transition-all active:scale-98',
                      b.is_urgent
                        ? 'bg-red-500/8 border-red-500/30'
                        : `bg-[#161b22] ${stepColor.border} hover:opacity-90`
                    )}>
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        {b.is_urgent && (
                          <span className="text-xs text-red-400 font-medium">● 加急</span>
                        )}
                        <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', stepColor.badge)}>
                          {typeLabel}
                        </span>
                        <span className="text-xs text-slate-500 font-mono">
                          {b.batch_no ?? b.order_no}
                        </span>
                      </div>
                      <ChevronRight size={14} className="text-slate-600 mt-0.5 shrink-0" />
                    </div>
                    <div className="text-sm font-medium text-slate-200 mb-1.5">
                      {b.product_model} · {b.customer_name}
                    </div>
                    <div className={cn('text-xs', stepColor.text)}>
                      第 {b.next_scan_index} 步：{STAGE_NAMES[b.next_scan_index]}
                    </div>
                  </button>
                )
              })
            )}
          </div>
        )}

        {/* 确认操作 */}
        {step === 'confirm' && selected && (
          <div className="space-y-4">
            {(() => {
              const stepColor = getStepColor(selected.next_scan_index)
              const typeLabel = getStepTypeLabel(selected.next_scan_index)
              return (
                <div className={cn(
                  'rounded-2xl border p-5',
                  selected.is_urgent ? 'bg-red-500/8 border-red-500/30' : `${stepColor.bg} ${stepColor.border}`
                )}>
                  {selected.is_urgent && (
                    <div className="flex items-center gap-1.5 text-red-400 text-xs font-medium mb-3">
                      <AlertCircle size={12} />
                      加急订单
                    </div>
                  )}
                  <div className="space-y-2.5 text-sm">
                    {[
                      ['订单号', selected.order_no, ''],
                      ['产品', `${selected.product_model} · ${selected.customer_name}`, ''],
                      ['当前工序', `第 ${selected.next_scan_index} 步`, 'text-orange-400'],
                      ['操作类型', typeLabel, stepColor.text],
                      ['操作', STAGE_NAMES[selected.next_scan_index], stepColor.text],
                    ].map(([k, v, color], i) => (
                      <div key={i} className="flex justify-between">
                        <span className="text-slate-500">{k}</span>
                        <span className={cn('text-xs', color || 'text-slate-300')}>{v}</span>
                      </div>
                    ))}
                    {selected.prev_weight !== null && (
                      <div className="flex justify-between pt-2 border-t border-white/5">
                        <span className="text-slate-500">上次称重</span>
                        <span className="text-slate-300">{selected.prev_weight} kg</span>
                      </div>
                    )}
                  </div>
                </div>
              )
            })()}
            <div className="flex gap-3">
              <button onClick={handleReset}
                className="flex-1 py-3.5 rounded-xl border border-white/10 text-slate-400 text-sm hover:bg-white/5 transition-all">
                取消
              </button>
              <button onClick={handleConfirm}
                className="flex-1 py-3.5 rounded-xl text-white text-sm font-medium transition-all hover:opacity-90 active:scale-98"
                style={{ background: 'linear-gradient(135deg, #f97316, #ea580c)' }}>
                {WEIGH_INDEXES.has(selected.next_scan_index) || selected.next_scan_index === 13
                  ? '下一步：录入数据'
                  : '确认完成'}
              </button>
            </div>
          </div>
        )}

        {/* 称重录入 */}
        {step === 'weigh' && selected && (
          <div className="space-y-4">
            <div className="bg-[#161b22] rounded-2xl border border-white/5 p-5">
              <div className="flex items-center gap-2 text-orange-400 text-sm font-medium mb-4">
                <Scale size={16} />
                录入称重数据
              </div>
              <div className="text-xs text-slate-500 mb-1">{STAGE_NAMES[selected.next_scan_index]}</div>
              {selected.prev_weight !== null && (
                <div className="text-sm text-slate-400 mb-4">
                  上次重量：<span className="text-slate-200">{selected.prev_weight} kg</span>
                </div>
              )}
              <div className="space-y-2">
                <label className="text-xs text-slate-500">本次称重（kg）</label>
                <div className="relative">
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.001"
                    value={weight}
                    onChange={e => setWeight(e.target.value)}
                    placeholder="0.000"
                    className="w-full px-4 py-4 text-2xl font-mono text-center bg-[#0d1117] border border-white/10 rounded-xl text-slate-100 placeholder-slate-700 focus:outline-none focus:border-orange-500/50"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 text-sm">kg</span>
                </div>
                {weight && selected.prev_weight !== null && (
                  <div className={cn(
                    'text-xs text-center py-1',
                    Math.abs((selected.prev_weight - parseFloat(weight)) / selected.prev_weight) > 0.02
                      ? 'text-red-400'
                      : 'text-green-400'
                  )}>
                    损耗 {(selected.prev_weight - parseFloat(weight)).toFixed(3)} kg
                    （{((selected.prev_weight - parseFloat(weight)) / selected.prev_weight * 100).toFixed(1)}%）
                    {Math.abs((selected.prev_weight - parseFloat(weight)) / selected.prev_weight) > 0.02
                      ? ' ⚠ 超过2%阈值'
                      : ' ✓ 正常'}
                  </div>
                )}
              </div>
            </div>
            {submitError && <p className="text-xs text-red-400 text-center">{submitError}</p>}
            <div className="flex gap-3">
              <button onClick={() => setStep('confirm')}
                className="flex-1 py-3.5 rounded-xl border border-white/10 text-slate-400 text-sm hover:bg-white/5 transition-all">
                返回
              </button>
              <button
                onClick={handleSubmit}
                disabled={!weight || submitting}
                className={cn(
                  'flex-1 py-3.5 rounded-xl text-white text-sm font-medium transition-all',
                  weight && !submitting ? 'hover:opacity-90 active:scale-98' : 'opacity-40 cursor-not-allowed'
                )}
                style={{ background: 'linear-gradient(135deg, #f97316, #ea580c)' }}>
                {submitting ? '提交中...' : '提交'}
              </button>
            </div>
          </div>
        )}

        {/* 入库录入（数量+重量） */}
        {step === 'qty' && selected && (
          <div className="space-y-4">
            <div className="bg-[#161b22] rounded-2xl border border-white/5 p-5">
              <div className="flex items-center gap-2 text-orange-400 text-sm font-medium mb-4">
                <Scale size={16} />
                入库确认
              </div>
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs text-slate-500">入库重量（kg）</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.001"
                    value={weight}
                    onChange={e => setWeight(e.target.value)}
                    placeholder="0.000"
                    className="w-full px-4 py-3 text-xl font-mono text-center bg-[#0d1117] border border-white/10 rounded-xl text-slate-100 placeholder-slate-700 focus:outline-none focus:border-orange-500/50"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-slate-500">入库数量（根）</label>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={qty}
                    onChange={e => setQty(e.target.value)}
                    placeholder="0"
                    className="w-full px-4 py-3 text-xl font-mono text-center bg-[#0d1117] border border-white/10 rounded-xl text-slate-100 placeholder-slate-700 focus:outline-none focus:border-orange-500/50"
                  />
                </div>
              </div>
            </div>
            {submitError && <p className="text-xs text-red-400 text-center">{submitError}</p>}
            <div className="flex gap-3">
              <button onClick={() => setStep('confirm')}
                className="flex-1 py-3.5 rounded-xl border border-white/10 text-slate-400 text-sm hover:bg-white/5 transition-all">
                返回
              </button>
              <button
                onClick={handleSubmit}
                disabled={!weight || !qty || submitting}
                className={cn(
                  'flex-1 py-3.5 rounded-xl text-white text-sm font-medium transition-all',
                  weight && qty && !submitting ? 'hover:opacity-90 active:scale-98' : 'opacity-40 cursor-not-allowed'
                )}
                style={{ background: 'linear-gradient(135deg, #f97316, #ea580c)' }}>
                {submitting ? '提交中...' : '确认入库'}
              </button>
            </div>
          </div>
        )}

        {/* 完成 */}
        {step === 'done' && (
          <div className="text-center space-y-5 py-10">
            <div className="w-20 h-20 rounded-full bg-green-500/15 border border-green-500/30 flex items-center justify-center mx-auto">
              <CheckCircle2 size={36} className="text-green-400" />
            </div>
            <div>
              <div className="text-lg font-medium text-slate-200 mb-1">操作完成</div>
              <div className="text-sm text-slate-500">记录已保存，时间戳已锁定</div>
            </div>
            <button onClick={handleReset}
              className="px-10 py-3.5 rounded-xl text-white text-sm font-medium transition-all hover:opacity-90"
              style={{ background: 'linear-gradient(135deg, #f97316, #ea580c)' }}>
              继续下一批
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
