import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatWeight(kg: number) {
  return `${kg.toFixed(3)} kg`
}

export function formatCurrency(amount: number) {
  return new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY' }).format(amount)
}

export const STAGE_NAMES: Record<number, string> = {
  1: '称重员分发原材料',
  2: '五金加工-收料',
  3: '五金加工-完成',
  4: '称重员称五金产出',
  5: '热处理-收料',
  6: '热处理-完成',
  7: '称重员称热处理产出',
  8: '磨床-收料',
  9: '磨床-完成',
  10: '称重员称磨床产出',
  11: '校直-完成',
  12: '检验-完成',
  13: '入库确认',
  14: '出库发货',
}

export const ROLE_LABELS: Record<string, string> = {
  admin: '管理员',
  weigher: '称重员',
  metal_worker: '五金加工',
  heat_worker: '热处理',
  grinder: '磨床',
  straightener: '校直',
  inspector: '检验',
  warehouse: '入库',
}

export const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending: { label: '待接单', color: 'text-slate-400 bg-slate-400/10' },
  waiting_material: { label: '待备料', color: 'text-yellow-400 bg-yellow-400/10' },
  in_production: { label: '生产中', color: 'text-blue-400 bg-blue-400/10' },
  outsourcing: { label: '外协中', color: 'text-purple-400 bg-purple-400/10' },
  waiting_shipment: { label: '待出货', color: 'text-orange-400 bg-orange-400/10' },
  completed: { label: '已完成', color: 'text-green-400 bg-green-400/10' },
  cancelled: { label: '已取消', color: 'text-red-400 bg-red-400/10' },
}

export const INBOUND_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending_purchase: { label: '待采购', color: 'text-slate-400 bg-slate-400/10' },
  outsourcing:      { label: '外协中', color: 'text-purple-400 bg-purple-400/10' },
  in_transit:       { label: '运输中', color: 'text-yellow-400 bg-yellow-400/10' },
  inbound:          { label: '已入库', color: 'text-green-400 bg-green-400/10' },
}
