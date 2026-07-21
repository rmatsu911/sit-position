import { format, parseISO } from 'date-fns'
import { ja } from 'date-fns/locale'

export function yen(v: number): string {
  return `¥${v.toLocaleString('ja-JP')}`
}

export function manYen(v: number): string {
  return `${Math.round(v / 10000).toLocaleString('ja-JP')}万円`
}

/** YYYY/MM/DD */
export function ymd(iso: string): string {
  try {
    return format(parseISO(iso), 'yyyy/MM/dd')
  } catch {
    return iso
  }
}

/** M/d(E) */
export function mdE(iso: string): string {
  try {
    return format(parseISO(iso), 'M/d(E)', { locale: ja })
  } catch {
    return iso
  }
}

export function weekdayJa(iso: string): string {
  try {
    return format(parseISO(iso), 'E', { locale: ja })
  } catch {
    return ''
  }
}

export function isWeekend(iso: string): boolean {
  try {
    const d = parseISO(iso).getDay()
    return d === 0 || d === 6
  } catch {
    return false
  }
}
