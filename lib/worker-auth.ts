import { supabase } from './supabase'
import bcrypt from 'bcryptjs'

export type WorkerProfile = {
  id: string
  worker_no: string
  display_name: string
  role_type: string
  product_line: string | null
  is_active: boolean
  pin_changed: boolean
}

const STORAGE_KEY = 'zhipai_worker'
const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000 // 30天
const MAX_ATTEMPTS = 5
const LOCK_DURATION_MS = 15 * 60 * 1000 // 15分钟

type StoredSession = {
  worker: WorkerProfile
  expires_at: number
}

export function getStoredWorker(): WorkerProfile | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const session: StoredSession = JSON.parse(raw)
    if (Date.now() > session.expires_at) {
      localStorage.removeItem(STORAGE_KEY)
      return null
    }
    return session.worker
  } catch {
    return null
  }
}

export function storeWorker(worker: WorkerProfile) {
  const session: StoredSession = {
    worker,
    expires_at: Date.now() + SESSION_DURATION_MS,
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session))
}

export function clearWorker() {
  localStorage.removeItem(STORAGE_KEY)
}

export async function loginWorker(
  workerNo: string,
  pin: string
): Promise<{ worker: WorkerProfile } | { error: string }> {
  const { data, error } = await supabase
    .from('worker_profiles')
    .select('id, worker_no, display_name, role_type, product_line, is_active, pin_hash, pin_changed, login_attempts, locked_until')
    .eq('worker_no', workerNo.toUpperCase())
    .eq('is_active', true)
    .single()

  if (error || !data) return { error: '工号不存在或已停用' }

  // 检查是否被锁定
  if (data.locked_until && new Date(data.locked_until) > new Date()) {
    const remaining = Math.ceil((new Date(data.locked_until).getTime() - Date.now()) / 60000)
    return { error: `账号已锁定，请 ${remaining} 分钟后再试` }
  }

  const pinMatch = await bcrypt.compare(pin, data.pin_hash)

  if (!pinMatch) {
    const newAttempts = (data.login_attempts ?? 0) + 1
    const shouldLock = newAttempts >= MAX_ATTEMPTS
    await supabase
      .from('worker_profiles')
      .update({
        login_attempts: newAttempts,
        ...(shouldLock ? { locked_until: new Date(Date.now() + LOCK_DURATION_MS).toISOString() } : {}),
      })
      .eq('id', data.id)
    if (shouldLock) return { error: '连续错误5次，账号已锁定15分钟' }
    return { error: `PIN 错误（还剩 ${MAX_ATTEMPTS - newAttempts} 次机会）` }
  }

  // 登录成功，重置失败计数
  await supabase
    .from('worker_profiles')
    .update({
      last_login: new Date().toISOString(),
      login_attempts: 0,
      locked_until: null,
    })
    .eq('id', data.id)

  const worker: WorkerProfile = {
    id: data.id,
    worker_no: data.worker_no,
    display_name: data.display_name,
    role_type: data.role_type,
    product_line: data.product_line,
    is_active: data.is_active,
    pin_changed: data.pin_changed ?? false,
  }

  storeWorker(worker)
  return { worker }
}

export async function changePin(
  workerId: string,
  newPin: string
): Promise<{ error?: string }> {
  const hash = await bcrypt.hash(newPin, 10)
  const { error } = await supabase
    .from('worker_profiles')
    .update({ pin_hash: hash, pin_changed: true, login_attempts: 0, locked_until: null })
    .eq('id', workerId)
  if (error) return { error: error.message }

  // 更新 localStorage 里的 pin_changed 状态
  const stored = getStoredWorker()
  if (stored && stored.id === workerId) {
    storeWorker({ ...stored, pin_changed: true })
  }
  return {}
}

export async function resetPinToDefault(workerNo: string): Promise<{ error?: string }> {
  const hash = await bcrypt.hash('0000', 10)
  const { error } = await supabase
    .from('worker_profiles')
    .update({ pin_hash: hash, pin_changed: false, login_attempts: 0, locked_until: null })
    .eq('worker_no', workerNo.toUpperCase())
  if (error) return { error: error.message }
  return {}
}
