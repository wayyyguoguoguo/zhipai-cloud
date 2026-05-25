'use client'

import { useState, useEffect } from 'react'
import { cn, INBOUND_STATUS_LABELS } from '@/lib/utils'
import { ChevronDown, X, Link2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useTenant } from '@/lib/tenant-context'

type Batch = {
  id: string
  batch_no: string
  order_id: string | null
  supplier: string | null
  material_spec: string | null
  material_grade: string | null
  inbound_date: string
  inbound_weight: number
  estimated_weight: number | null
  inbound_status: string
  status: string
  orders?: { order_no: string } | null
}

type OrderOption = {
  id: string
  order_no: string
  customer_name: string
  product_model: string
  quantity: number
}

function AllocateModal({
  batch,
  tenantId,
  onClose,
  onDone,
}: {
  batch: Batch
  tenantId: string
  onClose: () => void
  onDone: () => void
}) {
  const [orders, setOrders] = useState<OrderOption[]>([])
  const [selectedOrderId, setSelectedOrderId] = useState('')
  const [allocWeight, setAllocWeight] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase
      .from('orders')
      .select('id, order_no, customer_name, product_model, quantity')
      .eq('tenant_id', tenantId)
      .in('status', ['waiting_material', 'in_production', 'pending'])
      .order('created_at', { ascending: false })
      .then(({ data }) => setOrders(data ?? []))
  }, [tenantId])

  async function handleSubmit() {
    if (!selectedOrderId || !allocWeight) return
    const w = parseFloat(allocWeight)
    if (isNaN(w) || w <= 0) { setError('请输入有效重量'); return }
    if (w > batch.inbound_weight) { setError('分配重量不能超过入库重量'); return }
    setSaving(true)
    setError('')

    const { error: insertErr } = await supabase.from('material_allocations').insert({
      batch_id: batch.id,
      order_id: selectedOrderId,
      allocated_weight: w,
      tenant_id: tenantId,
    })

    if (insertErr) {
      setError(insertErr.code === '23505' ? '该批次已分配给此订单' : '分配失败：' + insertErr.message)
      setSaving(false)
      return
    }

    const newStatus = w >= batch.inbound_weight ? 'exhausted' : 'partially_used'
    await supabase.from('material_batches').update({ status: newStatus }).eq('id', batch.id)

    setSaving(false)
    onDone()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}>
      <div className="bg-[#161b22] border border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <Link2 size={14} className="text-orange-400" />
            <h2 className="text-sm font-medium text-slate-200">分配原料批次</h2>
          </div>
          <button onClick={onClose} className="text-slate-600 hover:text-slate-400 transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="bg-[#0d1117] rounded-xl p-3 mb-5 text-xs space-y-1.5">
          <div className="flex justify-between">
            <span className="text-slate-500">批次号</span>
            <span className="text-orange-400 font-mono">{batch.batch_no}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">规格 / 材质</span>
            <span className="text-slate-300">{batch.material_spec || '—'} · {batch.material_grade || '—'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">入库重量</span>
            <span className="text-slate-300">{batch.inbound_weight} kg</span>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-xs text-slate-500 mb-1.5 block">选择订单</label>
            <select
              value={selectedOrderId}
              onChange={e => setSelectedOrderId(e.target.value)}
              className="w-full px-3 py-2.5 text-sm bg-[#0d1117] border border-white/8 rounded-xl text-slate-300 focus:outline-none focus:border-orange-500/50">
              <option value="">-- 请选择订单 --</option>
              {orders.map(o => (
                <option key={o.id} value={o.id}>
                  {o.order_no} · {o.product_model} · {o.customer_name} ({o.quantity.toLocaleString()}根)
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs text-slate-500 mb-1.5 block">分配重量（kg）</label>
            <input
              type="number"
              step="0.001"
              value={allocWeight}
              onChange={e => setAllocWeight(e.target.value)}
              placeholder={`最多 ${batch.inbound_weight} kg`}
              className="w-full px-3 py-2.5 text-sm bg-[#0d1117] border border-white/8 rounded-xl text-slate-300 placeholder-slate-700 focus:outline-none focus:border-orange-500/50"
            />
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}

          <div className="flex gap-3 pt-1">
            <button onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-white/10 text-slate-400 text-sm hover:bg-white/5 transition-all">
              取消
            </button>
            <button
              onClick={handleSubmit}
              disabled={!selectedOrderId || !allocWeight || saving}
              className="flex-1 py-2.5 rounded-xl text-white text-sm font-medium transition-all hover:opacity-90 disabled:opacity-40"
              style={{ background: 'linear-gradient(135deg, #f97316, #ea580c)' }}>
              {saving ? '分配中...' : '确认分配'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function EditInfoModal({
  batch,
  onClose,
  onDone,
}: {
  batch: Batch
  onClose: () => void
  onDone: () => void
}) {
  const [form, setForm] = useState({
    supplier: batch.supplier ?? '',
    material_spec: batch.material_spec ?? '',
    material_grade: batch.material_grade ?? '',
    inbound_weight: String(batch.inbound_weight),
  })
  const [saving, setSaving] = useState(false)

  async function handleSubmit() {
    setSaving(true)
    await supabase.from('material_batches').update({
      supplier: form.supplier || null,
      material_spec: form.material_spec || null,
      material_grade: form.material_grade || null,
      inbound_weight: parseFloat(form.inbound_weight),
    }).eq('id', batch.id)
    setSaving(false)
    onDone()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}>
      <div className="bg-[#161b22] border border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-sm font-medium text-slate-200">补填原料信息</h2>
          <button onClick={onClose} className="text-slate-600 hover:text-slate-400"><X size={16} /></button>
        </div>
        <div className="space-y-3">
          {[
            { key: 'supplier', label: '供应商', placeholder: '如：宁波钢材' },
            { key: 'material_spec', label: '规格型号', placeholder: '如：14.95×472' },
            { key: 'material_grade', label: '材质', placeholder: '如：45#钢' },
            { key: 'inbound_weight', label: '实际入库重量（kg）', placeholder: '0.000', type: 'number' },
          ].map(f => (
            <div key={f.key}>
              <label className="text-xs text-slate-500 mb-1 block">{f.label}</label>
              <input
                type={f.type || 'text'}
                placeholder={f.placeholder}
                value={form[f.key as keyof typeof form]}
                onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                className="w-full px-3 py-2 text-sm bg-[#0d1117] border border-white/8 rounded-lg text-slate-300 placeholder-slate-700 focus:outline-none focus:border-orange-500/50"
              />
            </div>
          ))}
        </div>
        <div className="flex gap-3 mt-5">
          <button onClick={onClose}
            className="flex-1 py-2 rounded-xl border border-white/10 text-slate-400 text-sm hover:bg-white/5 transition-all">
            取消
          </button>
          <button onClick={handleSubmit} disabled={saving}
            className="flex-1 py-2 rounded-xl text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-all"
            style={{ background: 'linear-gradient(135deg, #f97316, #ea580c)' }}>
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  )
}

function BatchCard({
  batch,
  onAllocate,
  onEditInfo,
  onStatusChange,
}: {
  batch: Batch
  onAllocate: () => void
  onEditInfo: () => void
  onStatusChange: (status: string) => void
}) {
  const [dispensed, setDispensed] = useState<number | null>(null)
  const [showStatusMenu, setShowStatusMenu] = useState(false)

  useEffect(() => {
    supabase
      .from('process_transfers')
      .select('weight_in')
      .eq('batch_id', batch.id)
      .eq('scan_index', 1)
      .then(({ data }) => {
        const total = data?.reduce((sum, r) => sum + (r.weight_in ?? 0), 0) ?? 0
        setDispensed(total)
      })
  }, [batch.id])

  const inboundLabel = INBOUND_STATUS_LABELS[batch.inbound_status] ?? { label: batch.inbound_status, color: 'text-slate-400 bg-slate-400/10' }
  const remaining = dispensed !== null ? batch.inbound_weight - dispensed : null

  return (
    <div className="bg-[#161b22] border border-white/5 rounded-xl p-4 flex flex-col gap-3 hover:border-white/10 transition-colors">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-mono text-xs text-orange-400">{batch.batch_no}</div>
          {batch.orders?.order_no && (
            <div className="text-[10px] text-slate-600 mt-0.5">关联订单 {batch.orders.order_no}</div>
          )}
        </div>
        {/* 入库状态下拉 */}
        <div className="relative">
          <button
            onClick={() => setShowStatusMenu(v => !v)}
            className={cn('flex items-center gap-1 px-2 py-0.5 rounded-full text-xs transition-colors', inboundLabel.color)}>
            {inboundLabel.label}
            <ChevronDown size={10} />
          </button>
          {showStatusMenu && (
            <div className="absolute right-0 top-full mt-1 z-20 bg-[#1c2128] border border-white/10 rounded-xl shadow-2xl overflow-hidden min-w-[100px]">
              {Object.entries(INBOUND_STATUS_LABELS).map(([key, val]) => (
                <button
                  key={key}
                  onClick={() => { onStatusChange(key); setShowStatusMenu(false) }}
                  className={cn(
                    'w-full text-left px-3 py-2 text-xs transition-colors hover:bg-white/5',
                    val.color,
                    batch.inbound_status === key && 'bg-white/5'
                  )}>
                  {val.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Info */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
        <div>
          <span className="text-slate-600">供应商</span>
          <div className="text-slate-300 mt-0.5">{batch.supplier || <span className="text-slate-600 italic">待填写</span>}</div>
        </div>
        <div>
          <span className="text-slate-600">规格 / 材质</span>
          <div className="text-slate-300 mt-0.5">
            {batch.material_spec || batch.material_grade
              ? `${batch.material_spec || '—'} · ${batch.material_grade || '—'}`
              : <span className="text-slate-600 italic">待填写</span>}
          </div>
        </div>
        <div>
          <span className="text-slate-600">预计 / 实际入库</span>
          <div className="text-slate-300 mt-0.5">
            {batch.estimated_weight != null ? `${batch.estimated_weight} kg` : '—'}
            <span className="text-slate-600 mx-1">/</span>
            {batch.inbound_weight} kg
          </div>
        </div>
        <div>
          <span className="text-slate-600">剩余 / 总量</span>
          <div className="mt-0.5">
            {remaining !== null
              ? <span className={cn('font-medium', remaining < 0 ? 'text-red-400' : 'text-slate-300')}>
                  {remaining.toFixed(3)} / {batch.inbound_weight} kg
                </span>
              : <span className="text-slate-600">计算中...</span>}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between pt-1 border-t border-white/5">
        <span className="text-[10px] text-slate-600">{batch.inbound_date}</span>
        <div className="flex gap-2">
          <button
            onClick={onEditInfo}
            className="text-xs text-slate-500 hover:text-slate-300 transition-colors">
            补填信息
          </button>
          <button
            onClick={onAllocate}
            className="text-xs text-orange-400 hover:text-orange-300 transition-colors">
            分配订单
          </button>
        </div>
      </div>
    </div>
  )
}

export default function MaterialsPage() {
  const [batches, setBatches] = useState<Batch[]>([])
  const [loading, setLoading] = useState(true)
  const [allocBatch, setAllocBatch] = useState<Batch | null>(null)
  const [editBatch, setEditBatch] = useState<Batch | null>(null)
  const tenantId = useTenant()

  useEffect(() => {
    if (!tenantId) return
    fetchBatches()

    const channel = supabase.channel('materials-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'material_batches' }, fetchBatches)
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [tenantId])

  async function fetchBatches() {
    const { data, error } = await supabase
      .from('material_batches')
      .select('*, orders(order_no)')
      .eq('tenant_id', tenantId)
      .order('inbound_date', { ascending: false })

    if (!error && data) setBatches(data)
    setLoading(false)
  }

  async function handleStatusChange(batchId: string, newStatus: string) {
    await supabase.from('material_batches').update({ inbound_status: newStatus }).eq('id', batchId).eq('tenant_id', tenantId)
    setBatches(prev => prev.map(b => b.id === batchId ? { ...b, inbound_status: newStatus } : b))

    if (newStatus === 'inbound') {
      const batch = batches.find(b => b.id === batchId)
      if (batch?.order_id) {
        await supabase
          .from('orders')
          .update({ status: 'in_production' })
          .eq('id', batch.order_id)
          .eq('tenant_id', tenantId)
          .eq('status', 'pending')
      }
    }
  }

  return (
    <div className="p-6 space-y-5">
      {allocBatch && (
        <AllocateModal
          batch={allocBatch}
          tenantId={tenantId}
          onClose={() => setAllocBatch(null)}
          onDone={() => { setAllocBatch(null); fetchBatches() }}
        />
      )}
      {editBatch && (
        <EditInfoModal
          batch={editBatch}
          onClose={() => setEditBatch(null)}
          onDone={() => { setEditBatch(null); fetchBatches() }}
        />
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-100">原料管理</h1>
          <p className="text-sm text-slate-500 mt-0.5">共 {batches.length} 批次</p>
        </div>
        <div className="text-xs text-slate-600 bg-[#161b22] border border-white/5 px-3 py-1.5 rounded-lg">
          原料批次在新建订单时自动生成
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-slate-600 text-sm">加载中...</div>
      ) : batches.length === 0 ? (
        <div className="flex items-center justify-center py-16 text-slate-600 text-sm">暂无原料批次，请先新建订单</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {batches.map(b => (
            <BatchCard
              key={b.id}
              batch={b}
              onAllocate={() => setAllocBatch(b)}
              onEditInfo={() => setEditBatch(b)}
              onStatusChange={status => handleStatusChange(b.id, status)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
