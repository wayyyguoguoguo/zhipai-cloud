'use client'

import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { Settings, Factory, AlertTriangle, Users, Save, RotateCcw, Check } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { resetPinToDefault } from '@/lib/worker-auth'

const SETTINGS_KEY = 'zhipai_settings'

type AppSettings = {
  factory_name: string
  factory_location: string
  daily_target: number
  loss_threshold: number
  timeout_hours: number
  weight_diff_threshold: number
}

const defaultSettings: AppSettings = {
  factory_name: '新鄞工缝纫机科技',
  factory_location: '宁波',
  daily_target: 150000,
  loss_threshold: 2,
  timeout_hours: 12,
  weight_diff_threshold: 2,
}

function loadSettings(): AppSettings {
  if (typeof window === 'undefined') return defaultSettings
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (!raw) return defaultSettings
    return { ...defaultSettings, ...JSON.parse(raw) }
  } catch {
    return defaultSettings
  }
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings>(defaultSettings)
  const [saved, setSaved] = useState(false)
  const [workers, setWorkers] = useState<{ id: string; worker_no: string; display_name: string; role_type: string }[]>([])
  const [resetTarget, setResetTarget] = useState('')
  const [resetting, setResetting] = useState(false)
  const [resetDone, setResetDone] = useState('')

  useEffect(() => {
    setSettings(loadSettings())
    supabase
      .from('worker_profiles')
      .select('id, worker_no, display_name, role_type')
      .eq('is_active', true)
      .order('worker_no')
      .then(({ data }) => setWorkers(data ?? []))
  }, [])

  function handleSave() {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  async function handleResetPin() {
    if (!resetTarget) return
    setResetting(true)
    setResetDone('')
    const result = await resetPinToDefault(resetTarget)
    setResetting(false)
    setResetDone(result.error ? '重置失败：' + result.error : `${resetTarget.toUpperCase()} PIN已重置为 0000（下次登录需重新设置）`)
    setResetTarget('')
  }

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-100 flex items-center gap-2">
            <Settings size={18} className="text-orange-400" />
            系统设置
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">工厂配置与预警阈值</p>
        </div>
        <button
          onClick={handleSave}
          className={cn(
            'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
            saved
              ? 'bg-green-500/20 text-green-400 border border-green-500/30'
              : 'text-white hover:opacity-90'
          )}
          style={saved ? {} : { background: 'linear-gradient(135deg, #f97316, #ea580c)' }}>
          {saved ? <><Check size={14} /> 已保存</> : <><Save size={14} /> 保存设置</>}
        </button>
      </div>

      {/* 工厂基本信息 */}
      <div className="bg-[#161b22] rounded-xl border border-white/5 p-5">
        <h2 className="text-sm font-medium text-slate-300 mb-4 flex items-center gap-2">
          <Factory size={14} className="text-orange-400" />
          工厂基本信息
        </h2>
        <div className="grid grid-cols-2 gap-4">
          {[
            { key: 'factory_name', label: '工厂名称', type: 'text' },
            { key: 'factory_location', label: '所在城市', type: 'text' },
            { key: 'daily_target', label: '日产值目标（元）', type: 'number' },
          ].map(f => (
            <div key={f.key}>
              <label className="text-xs text-slate-500 mb-1.5 block">{f.label}</label>
              <input
                type={f.type}
                value={settings[f.key as keyof AppSettings]}
                onChange={e => setSettings(prev => ({
                  ...prev,
                  [f.key]: f.type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value
                }))}
                className="w-full px-3 py-2 text-sm bg-[#0d1117] border border-white/8 rounded-lg text-slate-300 focus:outline-none focus:border-orange-500/50"
              />
            </div>
          ))}
          <div>
            <label className="text-xs text-slate-500 mb-1.5 block">日产值目标预览</label>
            <div className="px-3 py-2 text-sm bg-orange-500/5 border border-orange-500/20 rounded-lg text-orange-400">
              ¥{(settings.daily_target / 10000).toFixed(1)} 万元/天
            </div>
          </div>
        </div>
      </div>

      {/* 预警阈值 */}
      <div className="bg-[#161b22] rounded-xl border border-white/5 p-5">
        <h2 className="text-sm font-medium text-slate-300 mb-4 flex items-center gap-2">
          <AlertTriangle size={14} className="text-yellow-400" />
          预警阈值配置
        </h2>
        <div className="grid grid-cols-3 gap-4">
          {[
            { key: 'loss_threshold', label: '工序损耗率预警（%）', desc: '超过此值自动标红', min: 0.1, step: 0.1 },
            { key: 'weight_diff_threshold', label: '重量差异预警（%）', desc: '相邻两次重量差超过此值', min: 0.1, step: 0.1 },
            { key: 'timeout_hours', label: '流程超时预警（小时）', desc: '批次在节点间停留超过此值', min: 1, step: 1 },
          ].map(f => (
            <div key={f.key}>
              <label className="text-xs text-slate-500 mb-1 block">{f.label}</label>
              <input
                type="number"
                min={f.min}
                step={f.step}
                value={settings[f.key as keyof AppSettings]}
                onChange={e => setSettings(prev => ({
                  ...prev,
                  [f.key]: parseFloat(e.target.value) || 0
                }))}
                className="w-full px-3 py-2 text-sm bg-[#0d1117] border border-white/8 rounded-lg text-slate-300 focus:outline-none focus:border-orange-500/50"
              />
              <p className="text-xs text-slate-700 mt-1">{f.desc}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 p-3 bg-yellow-500/5 border border-yellow-500/15 rounded-lg text-xs text-slate-500">
          当前配置：损耗率 &gt; <span className="text-yellow-400">{settings.loss_threshold}%</span> 预警，
          重量差 &gt; <span className="text-yellow-400">{settings.weight_diff_threshold}%</span> 预警，
          超时 &gt; <span className="text-yellow-400">{settings.timeout_hours}h</span> 预警
        </div>
      </div>

      {/* 工人PIN重置 */}
      <div className="bg-[#161b22] rounded-xl border border-white/5 p-5">
        <h2 className="text-sm font-medium text-slate-300 mb-4 flex items-center gap-2">
          <Users size={14} className="text-blue-400" />
          工人PIN重置
        </h2>
        <p className="text-xs text-slate-500 mb-4">重置后PIN恢复为初始值 <span className="text-slate-300 font-mono">0000</span>，工人下次登录需重新设置。</p>
        <div className="flex gap-3 items-end">
          <div className="flex-1">
            <label className="text-xs text-slate-500 mb-1.5 block">选择工号</label>
            <select
              value={resetTarget}
              onChange={e => setResetTarget(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-[#0d1117] border border-white/8 rounded-lg text-slate-300 focus:outline-none focus:border-orange-500/50">
              <option value="">-- 选择工人 --</option>
              {workers.map(w => (
                <option key={w.id} value={w.worker_no}>
                  {w.worker_no} · {w.display_name}
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={handleResetPin}
            disabled={!resetTarget || resetting}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-all disabled:opacity-40">
            <RotateCcw size={13} />
            {resetting ? '重置中...' : '重置PIN'}
          </button>
        </div>
        {resetDone && (
          <p className={cn(
            'text-xs mt-3',
            resetDone.startsWith('重置失败') ? 'text-red-400' : 'text-green-400'
          )}>{resetDone}</p>
        )}

        {/* 工人列表 */}
        <div className="mt-4 border-t border-white/5 pt-4">
          <p className="text-xs text-slate-600 mb-3">共 {workers.filter(w => w.role_type !== 'admin').length} 名工人</p>
          <div className="grid grid-cols-3 gap-2">
            {workers.filter(w => w.role_type !== 'admin').map(w => (
              <div key={w.id} className="flex items-center gap-2 px-3 py-2 bg-[#0d1117] rounded-lg">
                <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                  style={{ background: 'linear-gradient(135deg, #f97316, #ea580c)' }}>
                  {w.display_name[0]}
                </div>
                <div className="min-w-0">
                  <div className="text-xs text-slate-300 truncate">{w.display_name}</div>
                  <div className="text-[10px] text-slate-600 font-mono">{w.worker_no}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 关于 */}
      <div className="bg-[#161b22] rounded-xl border border-white/5 p-5">
        <h2 className="text-sm font-medium text-slate-300 mb-3">关于智排云</h2>
        <div className="space-y-1.5 text-xs text-slate-500">
          <div className="flex justify-between"><span>版本</span><span className="text-slate-400">v0.1.0</span></div>
          <div className="flex justify-between"><span>技术栈</span><span className="text-slate-400">Next.js 14 · Supabase · Tailwind CSS</span></div>
          <div className="flex justify-between"><span>数据库</span><span className="text-slate-400 font-mono text-[10px]">swxqqvkisnhkcjkimeae.supabase.co</span></div>
        </div>
      </div>
    </div>
  )
}
