'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { adminLogin } from '@/lib/admin-auth'
import { Factory } from 'lucide-react'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleLogin() {
    if (!email || !password) return
    setLoading(true)
    setError('')
    const result = await adminLogin(email, password)
    setLoading(false)
    if ('error' in result) {
      setError(result.error)
    } else {
      router.push('/dashboard')
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
            style={{ background: 'linear-gradient(135deg, #f97316, #ea580c)' }}>
            <Factory className="text-white" size={24} />
          </div>
          <h1 className="text-2xl font-bold text-slate-100">智排云</h1>
          <p className="text-sm text-slate-500 mt-1">AI智能排产平台 · 管理端登录</p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-xs text-slate-500 mb-1.5 block">邮箱</label>
            <input
              type="email"
              placeholder="请输入邮箱"
              value={email}
              onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleLogin()}
              className="w-full px-4 py-3 text-sm bg-[#161b22] border border-white/10 rounded-xl text-slate-200 placeholder-slate-600 focus:outline-none focus:border-orange-500/60"
            />
          </div>
          <div>
            <label className="text-xs text-slate-500 mb-1.5 block">密码</label>
            <input
              type="password"
              placeholder="请输入密码"
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleLogin()}
              className="w-full px-4 py-3 text-sm bg-[#161b22] border border-white/10 rounded-xl text-slate-200 placeholder-slate-600 focus:outline-none focus:border-orange-500/60"
            />
          </div>
          {error && <p className="text-xs text-red-400 text-center">{error}</p>}
          <button
            onClick={handleLogin}
            disabled={loading || !email || !password}
            className="w-full py-3.5 rounded-xl text-white font-medium text-sm transition-all disabled:opacity-40 hover:opacity-90"
            style={{ background: 'linear-gradient(135deg, #f97316, #ea580c)' }}>
            {loading ? '登录中...' : '登录'}
          </button>
        </div>
      </div>
    </div>
  )
}
