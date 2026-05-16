import { supabase } from './supabase'
import md5 from 'md5'

export type WorkerProfile = {
  id: string
  worker_no: string
  display_name: string
  role_type: string
  product_line: string | null
  is_active: boolean
}

const STORAGE_KEY = 'zhipai_worker'
const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000 // 30天

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
    .select('id, worker_no, display_name, role_type, product_line, is_active, pin_hash')
    .eq('worker_no', workerNo.toUpperCase())
    .eq('is_active', true)
    .single()

  if (error || !data) return { error: '工号不存在或已停用' }

  if (md5(pin) !== data.pin_hash) return { error: 'PIN 错误' }

  // 更新最后登录时间
  await supabase
    .from('worker_profiles')
    .update({ last_login: new Date().toISOString() })
    .eq('id', data.id)

  const worker: WorkerProfile = {
    id: data.id,
    worker_no: data.worker_no,
    display_name: data.display_name,
    role_type: data.role_type,
    product_line: data.product_line,
    is_active: data.is_active,
  }

  storeWorker(worker)
  return { worker }
}
