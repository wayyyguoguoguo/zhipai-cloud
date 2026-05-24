'use client'

import { useState, useEffect, useRef } from 'react'
import { cn, STATUS_LABELS } from '@/lib/utils'
import { Plus, Search, X, ChevronDown } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import PRODUCT_SPECS from '@/lib/product_specs.json'

const PRODUCT_MODELS = ['上轴', '下轴', '针杆', '压杆', '送料轴', '抬牙轴', '立轴', '小产品']
const specsMap = PRODUCT_SPECS as Record<string, string[]>

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
  order_progress: { current_stage: number }[] | null
}

const emptyForm = {
  customer_name: '',
  product_model: '',
  product_spec: '',
  quantity: '',
  total_amount: '',
  material_weight: '',
  delivery_date: '',
  is_urgent: false,
}

function SpecCombobox({
  model,
  value,
  onChange,
}: {
  model: string
  value: string
  onChange: (v: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState(value)
  const ref = useRef<HTMLDivElement>(null)

  const options = specsMap[model] ?? []
  const filtered = query
    ? options.filter(s => s.toLowerCase().includes(query.toLowerCase()))
    : options

  useEffect(() => { setQuery(value) }, [value])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <input
          value={query}
          onChange={e => { setQuery(e.target.value); onChange(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          placeholder={model ? `搜索 ${model} 规格...` : '请先选择产品大类'}
          disabled={!model}
          className="w-full px-3 py-2 pr-8 text-sm bg-[#0d1117] border border-white/8 rounded-lg text-slate-300 placeholder-slate-700 focus:outline-none focus:border-orange-500/50 disabled:opacity-40"
        />
        <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-600 pointer-events-none" />
      </div>
      {open && model && filtered.length > 0 && (
        <div className="absolute z-50 top-full mt-1 w-full max-h-48 overflow-y-auto bg-[#1c2128] border border-white/10 rounded-xl shadow-2xl">
          {filtered.slice(0, 80).map((s, i) => (
            <button
              key={i}
              type="button"
              onMouseDown={() => { onChange(s); setQuery(s); setOpen(false) }}
              className={cn(
                'w-full text-left px-3 py-2 text-xs text-slate-300 hover:bg-orange-500/10 hover:text-orange-300 transition-colors',
                value === s && 'bg-orange-500/10 text-orange-400'
              )}>
              {s}
            </button>
          ))}
          {filtered.length > 80 && (
            <div className="px-3 py-2 text-xs text-slate-600">还有 {filtered.length - 80} 个，继续输入缩小范围</div>
          )}
        </div>
      )}
    </div>
  )
}

function CustomerCombobox({
  value,
  onChange,
  allOrders,
}: {
  value: string
  onChange: (v: string) => void
  allOrders: Order[]
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState(value)
  const ref = useRef<HTMLDivElement>(null)

  const customers = Array.from(new Set(allOrders.map(o => o.customer_name).filter(Boolean)))
  const filtered = query
    ? customers.filter(c => c.toLowerCase().includes(query.toLowerCase()))
    : customers

  useEffect(() => { setQuery(value) }, [value])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <input
          value={query}
          onChange={e => { setQuery(e.target.value); onChange(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          placeholder="如：杰克科技"
          className="w-full px-3 py-2 pr-8 text-sm bg-[#0d1117] border border-white/8 rounded-lg text-slate-300 placeholder-slate-700 focus:outline-none focus:border-orange-500/50"
        />
        <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-600 pointer-events-none" />
      </div>
      {open && filtered.length > 0 && (
        <div className="absolute z-50 top-full mt-1 w-full max-h-40 overflow-y-auto bg-[#1c2128] border border-white/10 rounded-xl shadow-2xl">
          {filtered.map((c, i) => (
            <button
              key={i}
              type="button"
              onMouseDown={() => { onChange(c); setQuery(c); setOpen(false) }}
              className={cn(
                'w-full text-left px-3 py-2 text-xs text-slate-300 hover:bg-orange-500/10 hover:text-orange-300 transition-colors',
                value === c && 'bg-orange-500/10 text-orange-400'
              )}>
              {c}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  useEffect(() => {
    fetchOrders()

    const channel = supabase
      .channel('orders-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, fetchOrders)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_progress' }, fetchOrders)
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  async function fetchOrders() {
    const { data, error } = await supabase
      .from('orders')
      .select('*, order_progress(current_stage)')
      .order('created_at', { ascending: false })

    if (!error && data) setOrders(data)
    setLoading(false)
  }

  async function genOrderNo() {
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '')
    const prefix = `ORD-${today}-`
    const { count } = await supabase
      .from('orders')
      .select('*', { count: 'exact', head: true })
      .like('order_no', `${prefix}%`)
    return `${prefix}${String((count ?? 0) + 1).padStart(3, '0')}`
  }

  async function genBatchNo() {
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '')
    const prefix = `MB-${today}-`
    const { count } = await supabase
      .from('material_batches')
      .select('*', { count: 'exact', head: true })
      .like('batch_no', `${prefix}%`)
    return `${prefix}${String((count ?? 0) + 1).padStart(4, '0')}`
  }

  const [editingId, setEditingId] = useState<string | null>(null)

  function openEdit(o: Order) {
    setEditingId(o.id)
    setForm({
      customer_name: o.customer_name,
      product_model: o.product_model,
      product_spec: o.product_spec ?? '',
      quantity: String(o.quantity),
      total_amount: String(Math.round(o.unit_price * o.quantity)),
      material_weight: '',
      delivery_date: o.delivery_date,
      is_urgent: o.is_urgent,
    })
    setFormError('')
    setShowForm(true)
  }

  function closeForm() {
    setShowForm(false)
    setEditingId(null)
    setForm(emptyForm)
    setFormError('')
  }

  async function handleSubmit() {
    setFormError('')
    if (!form.customer_name || !form.product_model || !form.product_spec || !form.quantity || !form.total_amount || !form.delivery_date) {
      setFormError('请填写所有必填项（含规格型号）')
      return
    }
    if (!editingId && !form.material_weight) {
      setFormError('请填写原材料重量')
      return
    }
    setSaving(true)

    const qty = parseInt(form.quantity)
    const totalAmount = parseFloat(form.total_amount)
    const unitPrice = totalAmount / qty

    if (editingId) {
      const { error } = await supabase
        .from('orders')
        .update({
          customer_name: form.customer_name,
          product_model: form.product_model,
          product_spec: form.product_spec,
          quantity: qty,
          unit_price: unitPrice,
          delivery_date: form.delivery_date,
          is_urgent: form.is_urgent,
        })
        .eq('id', editingId)

      if (error) {
        setFormError('保存失败：' + error.message)
        setSaving(false)
        return
      }
    } else {
      const orderNo = await genOrderNo()
      const { data: orderData, error: orderError } = await supabase
        .from('orders')
        .insert({
          order_no: orderNo,
          customer_name: form.customer_name,
          product_model: form.product_model,
          product_spec: form.product_spec,
          quantity: qty,
          unit_price: unitPrice,
          delivery_date: form.delivery_date,
          status: 'pending',
          is_urgent: form.is_urgent,
        })
        .select()
        .single()

      if (orderError || !orderData) {
        setFormError('保存失败：' + (orderError?.message ?? '未知错误'))
        setSaving(false)
        return
      }

      await supabase.from('order_progress').insert({
        order_id: orderData.id,
        current_stage: 0,
        current_stage_name: '待接单',
      })

      // 自动生成原料批次
      const batchNo = await genBatchNo()
      const materialWeight = parseFloat(form.material_weight)
      const { data: batchData, error: batchError } = await supabase
        .from('material_batches')
        .insert({
          order_id: orderData.id,
          batch_no: batchNo,
          estimated_weight: materialWeight,
          inbound_weight: materialWeight,
          inbound_status: 'pending_purchase',
          status: 'in_stock',
          inbound_date: new Date().toISOString().slice(0, 10),
        })
        .select()
        .single()

      if (batchError || !batchData) {
        setFormError('订单已创建，但原料批次生成失败：' + (batchError?.message ?? '未知错误'))
        setSaving(false)
        return
      }

      await supabase.from('material_allocations').insert({
        batch_id: batchData.id,
        order_id: orderData.id,
        allocated_weight: materialWeight,
      })
    }

    setSaving(false)
    closeForm()
  }

  const filtered = orders.filter(o => {
    const matchSearch = o.order_no.includes(search) || o.customer_name.includes(search) || o.product_model.includes(search)
    const matchStatus = statusFilter === 'all' || o.status === statusFilter
    return matchSearch && matchStatus
  })

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-100">订单管理</h1>
          <p className="text-sm text-slate-500 mt-0.5">共 {orders.length} 条订单</p>
        </div>
        <button
          onClick={() => { setEditingId(null); setForm(emptyForm); setFormError(''); setShowForm(true) }}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-all hover:opacity-90 active:scale-95"
          style={{ background: 'linear-gradient(135deg, #f97316, #ea580c)' }}>
          <Plus size={15} />
          新建订单
        </button>
      </div>

      {/* 新建/编辑弹窗 */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-[#161b22] border border-white/10 rounded-2xl w-full max-w-lg p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-semibold text-slate-100">{editingId ? '编辑订单' : '新建订单'}</h2>
              <button onClick={closeForm} className="text-slate-500 hover:text-slate-300">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">客户名称 *</label>
                  <CustomerCombobox
                    value={form.customer_name}
                    onChange={v => setForm(p => ({ ...p, customer_name: v }))}
                    allOrders={orders}
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">产品大类 *</label>
                  <select
                    value={form.product_model}
                    onChange={e => setForm(p => ({ ...p, product_model: e.target.value, product_spec: '' }))}
                    className="w-full px-3 py-2 text-sm bg-[#0d1117] border border-white/8 rounded-lg text-slate-300 focus:outline-none focus:border-orange-500/50">
                    <option value="">-- 选择大类 --</option>
                    {PRODUCT_MODELS.map(m => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-500 mb-1 block">规格型号 * <span className="text-slate-700">（可搜索，如 JK-5558G-0329上轴）</span></label>
                <SpecCombobox
                  model={form.product_model}
                  value={form.product_spec}
                  onChange={v => setForm(p => ({ ...p, product_spec: v }))}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">数量（根）*</label>
                  <input
                    type="number"
                    placeholder="0"
                    value={form.quantity}
                    onChange={e => setForm(p => ({ ...p, quantity: e.target.value }))}
                    className="w-full px-3 py-2 text-sm bg-[#0d1117] border border-white/8 rounded-lg text-slate-300 placeholder-slate-700 focus:outline-none focus:border-orange-500/50"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">订单总额（元）*</label>
                  <input
                    type="number"
                    placeholder="0.00"
                    value={form.total_amount}
                    onChange={e => setForm(p => ({ ...p, total_amount: e.target.value }))}
                    className="w-full px-3 py-2 text-sm bg-[#0d1117] border border-white/8 rounded-lg text-slate-300 placeholder-slate-700 focus:outline-none focus:border-orange-500/50"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">
                    原材料重量（kg）{editingId ? '' : '*'}
                  </label>
                  <input
                    type="number"
                    step="0.001"
                    placeholder="0.000"
                    value={form.material_weight}
                    onChange={e => setForm(p => ({ ...p, material_weight: e.target.value }))}
                    disabled={!!editingId}
                    className="w-full px-3 py-2 text-sm bg-[#0d1117] border border-white/8 rounded-lg text-slate-300 placeholder-slate-700 focus:outline-none focus:border-orange-500/50 disabled:opacity-40"
                  />
                  {!editingId && (
                    <p className="text-[10px] text-slate-600 mt-1">自动生成原料批次卡片</p>
                  )}
                </div>
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">交货日期 *</label>
                  <input
                    type="date"
                    value={form.delivery_date}
                    onChange={e => setForm(p => ({ ...p, delivery_date: e.target.value }))}
                    className="w-full px-3 py-2 text-sm bg-[#0d1117] border border-white/8 rounded-lg text-slate-300 focus:outline-none focus:border-orange-500/50"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">订单号（自动生成）</label>
                  <div className="px-3 py-2 text-sm bg-[#0d1117] border border-white/5 rounded-lg text-slate-600 font-mono">
                    ORD-{new Date().toISOString().slice(0,10).replace(/-/g,'')}-XXX
                  </div>
                </div>
                <div className="flex items-end pb-0.5">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={form.is_urgent}
                      onChange={e => setForm(p => ({ ...p, is_urgent: e.target.checked }))}
                      className="w-4 h-4 accent-orange-500"
                    />
                    <span className="text-sm text-slate-400">标记为加急订单</span>
                  </label>
                </div>
              </div>

              {form.quantity && form.total_amount && (
                <div className="px-3 py-2 bg-orange-500/5 border border-orange-500/20 rounded-lg text-sm text-orange-400">
                  订单总额：¥{parseFloat(form.total_amount).toLocaleString()}
                  <span className="text-orange-600 ml-2 text-xs">
                    （单价 ¥{(parseFloat(form.total_amount) / parseInt(form.quantity || '1')).toFixed(2)}/根）
                  </span>
                </div>
              )}

              {formError && <p className="text-xs text-red-400">{formError}</p>}
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={closeForm}
                className="flex-1 px-4 py-2 rounded-lg border border-white/10 text-slate-400 text-sm hover:bg-white/5 transition-all">
                取消
              </button>
              <button
                onClick={handleSubmit}
                disabled={saving}
                className="flex-1 px-4 py-2 rounded-lg text-white text-sm font-medium transition-all hover:opacity-90 disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg, #f97316, #ea580c)' }}>
                {saving ? '保存中...' : editingId ? '保存修改' : '创建订单'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="搜索订单号、客户、型号..."
            className="w-full pl-9 pr-4 py-2 text-sm bg-[#161b22] border border-white/8 rounded-lg text-slate-300 placeholder-slate-600 focus:outline-none focus:border-orange-500/50"
          />
        </div>
        <div className="flex gap-1.5">
          {['all', 'in_production', 'waiting_material', 'waiting_shipment', 'completed'].map(s => (
            <button key={s}
              onClick={() => setStatusFilter(s)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs transition-all',
                statusFilter === s
                  ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
                  : 'bg-[#161b22] text-slate-500 border border-white/5 hover:text-slate-300'
              )}>
              {s === 'all' ? '全部' : STATUS_LABELS[s]?.label}
            </button>
          ))}
        </div>
        <button className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-slate-500 bg-[#161b22] border border-white/5 hover:text-slate-300 transition-all">
          导出
        </button>
      </div>

      <div className="bg-[#161b22] rounded-xl border border-white/5 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-slate-600 text-sm">加载中...</div>
        ) : filtered.length === 0 ? (
          <div className="flex items-center justify-center py-16 text-slate-600 text-sm">
            {orders.length === 0 ? '暂无订单数据' : '无匹配结果'}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5 text-slate-500 text-xs">
                <th className="text-left px-4 py-3 font-normal">订单号</th>
                <th className="text-left px-4 py-3 font-normal">客户</th>
                <th className="text-left px-4 py-3 font-normal">产品型号</th>
                <th className="text-right px-4 py-3 font-normal">数量</th>
                <th className="text-right px-4 py-3 font-normal">金额</th>
                <th className="text-center px-4 py-3 font-normal">交期</th>
                <th className="text-center px-4 py-3 font-normal">生产进度</th>
                <th className="text-center px-4 py-3 font-normal">状态</th>
                <th className="text-center px-4 py-3 font-normal">操作</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((o) => {
                const s = STATUS_LABELS[o.status] ?? { label: o.status, color: 'text-slate-400 bg-slate-400/10' }
                const amount = o.quantity * o.unit_price
                const daysLeft = Math.ceil((new Date(o.delivery_date).getTime() - Date.now()) / 86400000)
                const stage = o.order_progress?.[0]?.current_stage ?? 0
                return (
                  <tr key={o.id} className={cn(
                    'border-b border-white/3 hover:bg-white/2 transition-colors',
                    o.is_urgent && 'bg-red-500/3'
                  )}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {o.is_urgent && (
                          <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse shrink-0" />
                        )}
                        <span className="font-mono text-xs text-slate-400">{o.order_no}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-300">{o.customer_name}</td>
                    <td className="px-4 py-3">
                      <span className="text-slate-300">{o.product_model}</span>
                      <span className="text-slate-600 text-xs ml-1">{o.product_spec}</span>
                    </td>
                    <td className="px-4 py-3 text-right text-slate-300">{o.quantity.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right text-slate-400 text-xs">¥{amount.toLocaleString()}</td>
                    <td className="px-4 py-3 text-center">
                      <div className="text-xs">
                        <div className={cn(
                          daysLeft <= 2 ? 'text-red-400' : daysLeft <= 5 ? 'text-yellow-400' : 'text-slate-400'
                        )}>{o.delivery_date}</div>
                        <div className="text-slate-600">
                          {daysLeft > 0 ? `剩 ${daysLeft} 天` : daysLeft === 0 ? '今日' : `逾期 ${-daysLeft} 天`}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1">
                        <div className="flex gap-0.5">
                          {Array.from({ length: 14 }).map((_, j) => (
                            <div key={j} className={cn(
                              'w-1 h-3 rounded-sm',
                              j < stage ? 'bg-orange-400' : 'bg-white/8'
                            )} />
                          ))}
                        </div>
                        <span className="text-xs text-slate-600 ml-1">{stage}/14</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={cn('px-2 py-0.5 rounded-full text-xs', s.color)}>{s.label}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <a href={`/tracking?id=${o.id}`} className="text-xs text-orange-400 hover:text-orange-300">
                          追踪
                        </a>
                        <button
                          onClick={() => openEdit(o)}
                          className="text-xs text-slate-500 hover:text-slate-300">
                          编辑
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
