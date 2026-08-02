import { CalendarDays, Flag, GanttChartSquare, LayoutGrid } from 'lucide-react'

/**
 * 工程管理のタブ定義。
 * 「案件工程」は案件単位の詳細工程、「横断工程」は複数案件の俯瞰で用途が異なるため、
 * どちらか一方に統合せず並存させる。
 */
export const SCHEDULE_TABS = [
  { key: 'project', label: '案件工程', icon: GanttChartSquare, path: '' },
  { key: 'cross', label: '横断工程', icon: LayoutGrid, path: '/cross' },
  { key: 'milestones', label: '横断マイルストーン', icon: Flag, path: '/milestones' },
  { key: 'calendar', label: 'カレンダー', icon: CalendarDays, path: '/calendar' },
] as const

export type ScheduleTab = (typeof SCHEDULE_TABS)[number]
export type ScheduleTabKey = ScheduleTab['key']

/**
 * タブのリンク先。案件が選択されていれば案件配下のURL、無ければ /schedule 配下。
 * URLで直接開けるようにし、再読込・共有に耐えるようにする。
 */
export function scheduleTabHref(tab: ScheduleTab, projectId?: number): string {
  const base = projectId ? `/projects/${projectId}/schedule` : '/schedule'
  return `${base}${tab.path}`
}
