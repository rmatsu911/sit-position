/**
 * カレンダーの共通イベントAPIクライアント。
 *
 * 工程・マイルストーン・品質確認期限・現場日報・試験記録を、1つの取得で
 * まとめて受け取る。画面側で別集計を作らず、絞り込みはすべてAPIへ渡す。
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/apiClient'

/** バックエンド CalendarEventOut に対応。 */
export interface CalendarEvent {
  event_id: string
  /** task / milestone / quality_check / daily_report / test_record */
  source_kind: string
  source_id: number
  project_id: number
  project_code: string
  project_name: string
  title: string
  start_at: string
  /** null は開始日だけの単日イベント */
  end_at: string | null
  schedule_precision: string
  status: string
  responsible_id: number | null
  responsible_name: string | null
  company_id: number | null
  company_name: string | null
  source_url: string
  editable: boolean
  /** plan / actual / due（予定・実績・期限を取り違えない） */
  record_kind: string
}

export interface CalendarEventsResponse {
  events: CalendarEvent[]
  total: number
  displayed: number
  truncated: boolean
  limit: number
  range_from: string
  range_to: string
}

export interface IdName { id: number; name: string }

export interface CalendarOptions {
  projects: IdName[]
  source_kinds: { key: string; label: string }[]
  statuses: string[]
  responsibles: IdName[]
  companies: IdName[]
}

/** 絞り込み条件。URLクエリと1対1で対応する。 */
export interface CalendarFilters {
  q: string
  projectIds: number[]
  sourceKinds: string[]
  statuses: string[]
  responsibleIds: number[]
  companyIds: number[]
}

export const EMPTY_CALENDAR_FILTERS: CalendarFilters = {
  q: '', projectIds: [], sourceKinds: [], statuses: [], responsibleIds: [], companyIds: [],
}

/** 種別ごとの表示名と色。判定は key（source_kind）で行い、名称からは推測しない。 */
export const SOURCE_KIND_STYLE: Record<string, { label: string; chip: string; dot: string }> = {
  task: { label: '工程', chip: 'border-sysken-200 bg-sysken-50 text-ink', dot: 'bg-sysken-600' },
  milestone: { label: 'マイルストーン', chip: 'border-violet-200 bg-violet-50 text-ink', dot: 'bg-violet-600' },
  quality_check: { label: '品質確認期限', chip: 'border-amber-200 bg-amber-50 text-ink', dot: 'bg-wn' },
  daily_report: { label: '現場日報', chip: 'border-emerald-200 bg-emerald-50 text-ink', dot: 'bg-ok' },
  test_record: { label: '試験記録', chip: 'border-slate-200 bg-slate-50 text-ink', dot: 'bg-slate-500' },
}

export const RECORD_KIND_LABEL: Record<string, string> = {
  plan: '予定', actual: '実績', due: '期限',
}

export function calendarQuery(
  f: CalendarFilters,
  range: { from: string; to: string },
  extra?: { projectId?: number },
): string {
  const qs = new URLSearchParams()
  qs.set('date_from', range.from)
  qs.set('date_to', range.to)
  if (extra?.projectId) qs.set('project_id', String(extra.projectId))
  if (f.q.trim()) qs.set('q', f.q.trim())
  if (f.projectIds.length) qs.set('project_ids', f.projectIds.join(','))
  if (f.sourceKinds.length) qs.set('source_kinds', f.sourceKinds.join(','))
  if (f.statuses.length) qs.set('statuses', f.statuses.join(','))
  if (f.responsibleIds.length) qs.set('responsible_ids', f.responsibleIds.join(','))
  if (f.companyIds.length) qs.set('company_ids', f.companyIds.join(','))
  return qs.toString()
}

export function hasAnyCalendarFilter(f: CalendarFilters): boolean {
  return !!(f.q.trim() || f.projectIds.length || f.sourceKinds.length || f.statuses.length
    || f.responsibleIds.length || f.companyIds.length)
}

export function useCalendarEvents(
  f: CalendarFilters, range: { from: string; to: string }, projectId?: number,
) {
  const query = calendarQuery(f, range, { projectId })
  return useQuery({
    queryKey: ['calendar-events', query],
    queryFn: () => api<CalendarEventsResponse>(`/schedule/calendar/events?${query}`),
  })
}

export function useCalendarOptions(projectId?: number) {
  return useQuery({
    queryKey: ['calendar-options', projectId ?? null],
    queryFn: () => api<CalendarOptions>(
      `/schedule/calendar/options${projectId ? `?project_id=${projectId}` : ''}`,
    ),
  })
}

// ===== 保存検索条件（既存の saved_searches を screen で使い分ける） =====
const SCREEN = 'schedule_calendar'

export interface SavedCalendarSearch {
  id: number
  screen: string
  name: string
  conditions: Partial<CalendarFilters> & { view?: string }
  created_at: string | null
  updated_at: string | null
}

export function useSavedCalendarSearches() {
  return useQuery({
    queryKey: ['saved-searches', SCREEN],
    queryFn: () => api<SavedCalendarSearch[]>(`/schedule/saved-searches?screen=${SCREEN}`),
  })
}

export function useSaveCalendarSearch() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, name, conditions }: { id?: number; name: string; conditions: object }) =>
      id
        ? api<SavedCalendarSearch>(`/schedule/saved-searches/${id}`, { method: 'PUT', body: { name, conditions } })
        : api<SavedCalendarSearch>('/schedule/saved-searches', {
            method: 'POST', body: { screen: SCREEN, name, conditions },
          }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['saved-searches', SCREEN] }),
  })
}

export function useDeleteCalendarSearch() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api<void>(`/schedule/saved-searches/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['saved-searches', SCREEN] }),
  })
}
