'use client'

import { useState } from 'react'
import { cn, STAGE_NAMES, ROLE_LABELS } from '@/lib/utils'
import { QrCode, CheckCircle2, Scale, AlertCircle, ChevronRight } from 'lucide-react'

// 模拟当前工人角色（实际从 Supabase Auth 读取）
const mockWorker = {
  name: '张师傅',
  role: 'weigher' as const,
  productLine: null,
}

// 模拟待处理批次
const mockBatches = [
  {
    id: '1',
    orderNo: 'ORD-20260513-001',
    batchNo: 'MB-20260513-0023',
    model: '上轴',
    customer: '杰克科技',
    scanIndex: 4,
    urgent: true,
    prevWeight: 285.6,
  },
  {
    id: '2',
    orderNo: 'ORD-20260513-002',
    batchNo: 'MB-20260513-0019',
    model: '下轴',
    customer: '拓卡奔马',
    scanIndex: 4,
    urgent: false,
    prevWeight: 198.3,
  },
  {
    id: '3',
    orderNo: 'ORD-20260512-015',
    batchNo: 'MB-20260512-0041',
    model: '针杆',
    customer: '标准件厂',
    scanIndex: 4,
    urgent: false,
    prevWeight: 142.0,
  },
]

type Step = 'list' | 'confirm' | 'weigh' | 'done'

export default function ScanPage() {
  const [step, setStep] = useState<Step>('list')
  const [selected, setSelected] = useState<typeof mockBatches[0] | null>(null)
  const [weight, setWeight] = useState('')
  const [scanning, setScanning] = useState(false)

  const needsWeight = selected && [1, 4, 7, 10, 13].includes(selected.scanIndex)

  const handleScan = (batch: typeof mockBatches[0]) => {
    setScanning(true)
    setTimeout(() => {
      setScanning(false)
      setSelected(batch)
      setStep('confirm')
    }, 800)
  }

  const handleConfirm = () => {
    if (needsWeight) {
      setStep('weigh')
    } else {
      setStep('done')
    }
  }

  const handleSubmit = () => {
    setStep('done')
  }

  const handleReset = () => {
    setStep('list')
    setSelected(null)
    setWeight('')
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-start pt-8 px-4 pb-8">
      {/* 工人身份卡 */}
      <div className="w-full max-w-sm mb-6">
        <div className="bg-[#161b22] rounded-xl border border-white/5 p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm"
            style={{ background: 'linear-gradient(135deg, #f97316, #ea580c)' }}>
            {mockWorker.name[0]}
          </div>
          <div>
            <div className="text-sm font-medium text-slate-200">{mockWorker.name}</div>
            <div className="text-xs text-slate-500">{ROLE_LABELS[mockWorker.role]}</div>
          </div>
          <div className="ml-auto flex items-center gap-1.5 text-xs text-green-400">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            在线
          </div>
        </div>
      </div>

      {/* 主内容区 */}
      <div className="w-full max-w-sm">

        {/* 待处理列表 */}
        {step === 'list' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-medium text-slate-300">待处理批次</h2>
              <span className="text-xs text-slate-500">{mockBatches.length} 条</span>
            </div>
            {mockBatches.map((b) => (
              <button key={b.id}
                onClick={() => handleScan(b)}
                disabled={scanning}
                className={cn(
                  'w-full text-left rounded-xl border p-4 transition-all active:scale-98',
                  b.urgent
                    ? 'bg-red-500/8 border-red-500/30 hover:border-red-500/50'
                    : 'bg-[#161b22] border-white/5 hover:border-orange-500/30'
                )}>
                <div className="flex items-start justify-between mb-2">
                  <div>
                    {b.urgent && (
                      <span className="text-xs text-red-400 font-medium mr-2">● 加急</span>
                    )}
                    <span className="text-xs text-slate-500 font-mono">{b.batchNo}</span>
                  </div>
                  <ChevronRight size={14} className="text-slate-600 mt-0.5" />
                </div>
                <div className="text-sm font-medium text-slate-200 mb-1">
                  {b.model} · {b.customer}
                </div>
                <div className="flex items-center gap-3 text-xs text-slate-500">
                  <span>{b.orderNo}</span>
                  <span className="text-orange-400">第 {b.scanIndex} 步：{STAGE_NAMES[b.scanIndex]}</span>
                </div>
              </button>
            ))}

            {scanning && (
              <div className="flex items-center justify-center gap-2 py-4 text-sm text-orange-400">
                <div className="w-4 h-4 border-2 border-orange-400 border-t-transparent rounded-full animate-spin" />
                扫码识别中...
              </div>
            )}
          </div>
        )}

        {/* 确认操作 */}
        {step === 'confirm' && selected && (
          <div className="space-y-4">
            <div className={cn(
              'rounded-xl border p-5',
              selected.urgent ? 'bg-red-500/8 border-red-500/30' : 'bg-[#161b22] border-white/5'
            )}>
              {selected.urgent && (
                <div className="flex items-center gap-1.5 text-red-400 text-xs font-medium mb-3">
                  <AlertCircle size={12} />
                  加急订单
                </div>
              )}
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">批次号</span>
                  <span className="font-mono text-slate-300 text-xs">{selected.batchNo}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">产品</span>
                  <span className="text-slate-200">{selected.model} · {selected.customer}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">当前工序</span>
                  <span className="text-orange-400">第 {selected.scanIndex} 步</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">操作</span>
                  <span className="text-slate-200">{STAGE_NAMES[selected.scanIndex]}</span>
                </div>
                {selected.prevWeight && (
                  <div className="flex justify-between pt-2 border-t border-white/5">
                    <span className="text-slate-500">上次称重</span>
                    <span className="text-slate-300">{selected.prevWeight} kg</span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-3">
              <button onClick={handleReset}
                className="flex-1 py-3 rounded-xl border border-white/10 text-slate-400 text-sm hover:bg-white/5 transition-all">
                取消
              </button>
              <button onClick={handleConfirm}
                className="flex-1 py-3 rounded-xl text-white text-sm font-medium transition-all hover:opacity-90 active:scale-98"
                style={{ background: 'linear-gradient(135deg, #f97316, #ea580c)' }}>
                {needsWeight ? '下一步：称重' : '确认完成'}
              </button>
            </div>
          </div>
        )}

        {/* 称重录入 */}
        {step === 'weigh' && selected && (
          <div className="space-y-4">
            <div className="bg-[#161b22] rounded-xl border border-white/5 p-5">
              <div className="flex items-center gap-2 text-orange-400 text-sm font-medium mb-4">
                <Scale size={16} />
                录入称重数据
              </div>
              <div className="text-xs text-slate-500 mb-1">{STAGE_NAMES[selected.scanIndex]}</div>
              <div className="text-sm text-slate-400 mb-4">
                上次重量：<span className="text-slate-200">{selected.prevWeight} kg</span>
              </div>

              <div className="space-y-2">
                <label className="text-xs text-slate-500">本次称重（kg）</label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.001"
                    value={weight}
                    onChange={e => setWeight(e.target.value)}
                    placeholder="0.000"
                    className="w-full px-4 py-4 text-2xl font-mono text-center bg-[#0d1117] border border-white/10 rounded-xl text-slate-100 placeholder-slate-700 focus:outline-none focus:border-orange-500/50"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 text-sm">kg</span>
                </div>
                {weight && selected.prevWeight && (
                  <div className={cn(
                    'text-xs text-center',
                    Math.abs((selected.prevWeight - parseFloat(weight)) / selected.prevWeight) > 0.02
                      ? 'text-red-400'
                      : 'text-green-400'
                  )}>
                    损耗：{(selected.prevWeight - parseFloat(weight)).toFixed(3)} kg
                    （{((selected.prevWeight - parseFloat(weight)) / selected.prevWeight * 100).toFixed(1)}%）
                    {Math.abs((selected.prevWeight - parseFloat(weight)) / selected.prevWeight) > 0.02
                      ? ' ⚠️ 超过2%阈值'
                      : ' ✓ 正常'}
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-3">
              <button onClick={() => setStep('confirm')}
                className="flex-1 py-3 rounded-xl border border-white/10 text-slate-400 text-sm hover:bg-white/5 transition-all">
                返回
              </button>
              <button
                onClick={handleSubmit}
                disabled={!weight}
                className={cn(
                  'flex-1 py-3 rounded-xl text-white text-sm font-medium transition-all',
                  weight
                    ? 'hover:opacity-90 active:scale-98'
                    : 'opacity-40 cursor-not-allowed'
                )}
                style={{ background: 'linear-gradient(135deg, #f97316, #ea580c)' }}>
                提交
              </button>
            </div>
          </div>
        )}

        {/* 完成 */}
        {step === 'done' && (
          <div className="text-center space-y-4 py-8">
            <div className="w-16 h-16 rounded-full bg-green-500/15 border border-green-500/30 flex items-center justify-center mx-auto">
              <CheckCircle2 size={32} className="text-green-400" />
            </div>
            <div>
              <div className="text-lg font-medium text-slate-200 mb-1">操作完成</div>
              <div className="text-sm text-slate-500">记录已保存，时间戳已锁定</div>
            </div>
            <button onClick={handleReset}
              className="px-8 py-3 rounded-xl text-white text-sm font-medium transition-all hover:opacity-90"
              style={{ background: 'linear-gradient(135deg, #f97316, #ea580c)' }}>
              继续下一批
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
