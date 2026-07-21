import { format, parseISO } from 'date-fns'
import { ja } from 'date-fns/locale'

export function formatYen(value: number): string {
  return `¥${value.toLocaleString('ja-JP')}`
}

export function formatManYen(value: number): string {
  return `${Math.round(value / 10000).toLocaleString('ja-JP')}万円`
}

export function formatDate(iso: string, pattern = 'yyyy年M月d日'): string {
  try {
    return format(parseISO(iso), pattern, { locale: ja })
  } catch {
    return iso
  }
}

export function formatDateWithDay(iso: string): string {
  return formatDate(iso, 'M月d日(E)')
}
