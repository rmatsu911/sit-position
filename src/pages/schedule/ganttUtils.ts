import { addDays, differenceInCalendarDays, eachDayOfInterval, format, parseISO } from 'date-fns'
import { ja } from 'date-fns/locale'
import { ganttRange, holidays } from '../../data/schedule'

export const rangeStart = parseISO(ganttRange.start)
export const rangeEnd = parseISO(ganttRange.end)
export const todayDate = parseISO(ganttRange.today)

export const days = eachDayOfInterval({ start: rangeStart, end: rangeEnd })

export type ViewMode = 'day' | 'week' | 'month'

export const dayWidthByMode: Record<ViewMode, number> = {
  day: 34,
  week: 15,
  month: 7,
}

export const ROW_H = 32

export function dayIndex(iso: string): number {
  return differenceInCalendarDays(parseISO(iso), rangeStart)
}

export function isHoliday(d: Date): boolean {
  const s = format(d, 'yyyy-MM-dd')
  return holidays.includes(s)
}

export function isWeekend(d: Date): boolean {
  const g = d.getDay()
  return g === 0 || g === 6
}

export function weekdayLabel(d: Date): string {
  return format(d, 'E', { locale: ja })
}

export function addDaysIso(iso: string, n: number): string {
  return format(addDays(parseISO(iso), n), 'yyyy-MM-dd')
}

export function spanDays(startIso: string, endIso: string): number {
  return differenceInCalendarDays(parseISO(endIso), parseISO(startIso)) + 1
}

// 天気アイコン（ダミー・日付固定）
const weatherSeq = ['☀', '☀', '⛅', '☁', '☀', '🌧', '⛅']
export function weatherFor(d: Date): string {
  return weatherSeq[differenceInCalendarDays(d, rangeStart) % weatherSeq.length]
}
