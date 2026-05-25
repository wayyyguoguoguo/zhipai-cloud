import { supabase } from './supabase'

export type AdminSession = {
  userId: string
  email: string
  tenantId: string
  displayName: string
}

const ADMIN_SESSION_KEY = 'zhipai_admin'

export async function adminLogin(
  email: string,
  password: string
): Promise<{ session: AdminSession } | { error: string }> {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error || !data.user) return { error: '邮箱或密码错误' }

  const { data: tenant, error: tenantError } = await supabase
    .from('admin_tenants')
    .select('tenant_id, display_name')
    .eq('user_id', data.user.id)
    .single()

  if (tenantError || !tenant) return { error: '账号未绑定租户，请联系管理员' }

  const session: AdminSession = {
    userId: data.user.id,
    email: data.user.email!,
    tenantId: tenant.tenant_id,
    displayName: tenant.display_name,
  }
  localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(session))
  return { session }
}

export async function adminLogout() {
  await supabase.auth.signOut()
  localStorage.removeItem(ADMIN_SESSION_KEY)
}

export function getAdminSession(): AdminSession | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(ADMIN_SESSION_KEY)
    if (!raw) return null
    return JSON.parse(raw) as AdminSession
  } catch {
    return null
  }
}

export async function refreshAdminSession(): Promise<AdminSession | null> {
  const { data } = await supabase.auth.getSession()
  if (!data.session?.user) {
    localStorage.removeItem(ADMIN_SESSION_KEY)
    return null
  }
  const { data: tenant } = await supabase
    .from('admin_tenants')
    .select('tenant_id, display_name')
    .eq('user_id', data.session.user.id)
    .single()

  if (!tenant) return null

  const session: AdminSession = {
    userId: data.session.user.id,
    email: data.session.user.email!,
    tenantId: tenant.tenant_id,
    displayName: tenant.display_name,
  }
  localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(session))
  return session
}
