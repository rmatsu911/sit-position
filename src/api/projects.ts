import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/apiClient'

// バックエンド ProjectOut に対応
export interface ApiProject {
  id: number
  construction_number: string
  name: string
  customer: string | null
  customer_type: string | null
  construction_type: string | null
  area: string | null
  location: string | null
  department: string | null
  manager: string | null
  status: string
  planned_progress: number
  actual_progress: number
  start_planned_at: string | null
  finish_planned_at: string | null
  contract_amount: number | null
  budget_planned: number | null
  budget_used: number | null
  unconfirmed_photos: number
  quality_checks: number
  updated_at: string | null
}

export interface ProjectCreateInput {
  construction_number: string
  name: string
  customer?: string
  customer_type?: string
  area?: string
  location?: string
  department_id?: number | null
  status?: string
  start_planned_at?: string | null
  finish_planned_at?: string | null
  contract_amount?: number | null
  budget_planned?: number | null
}

/** 案件一覧の絞り込み条件。URLクエリ・queryKey・APIと1対1で対応する。 */
export interface ProjectFilters {
  q: string
  statuses: string[]
  managerIds: number[]
  companyIds: number[]
  areas: string[]
  departmentIds: number[]
  delayedOnly: boolean
  dateFrom: string
  dateTo: string
}

export const EMPTY_PROJECT_FILTERS: ProjectFilters = {
  q: '', statuses: [], managerIds: [], companyIds: [], areas: [], departmentIds: [],
  delayedOnly: false, dateFrom: '', dateTo: '',
}

export type ProjectSort = 'recent' | 'code' | 'progress' | 'due'
export const PROJECT_SORTS: { key: ProjectSort; label: string }[] = [
  { key: 'recent', label: '登録が新しい順' },
  { key: 'code', label: '案件番号順' },
  { key: 'progress', label: '進捗率順' },
  { key: 'due', label: '完了予定日順' },
]

export const DEFAULT_PER_PAGE = 20

export interface ProjectSearchResponse {
  items: ApiProject[]
  /** 権限・全条件を適用した「ページネーション前」の件数 */
  total: number
  page: number
  per_page: number
  pages: number
  sort: string
}

export interface IdName { id: number; name: string }

export interface ProjectFilterOptions {
  statuses: string[]
  areas: string[]
  departments: IdName[]
  managers: IdName[]
  companies: IdName[]
}

/** 絞り込み条件をAPIのクエリ文字列へ。画面だけの条件は作らない。 */
export function projectSearchQuery(
  f: ProjectFilters, page: number, perPage: number, sort: ProjectSort,
): string {
  const qs = new URLSearchParams()
  if (f.q.trim()) qs.set('q', f.q.trim())
  if (f.statuses.length) qs.set('statuses', f.statuses.join(','))
  if (f.managerIds.length) qs.set('manager_ids', f.managerIds.join(','))
  if (f.companyIds.length) qs.set('company_ids', f.companyIds.join(','))
  if (f.areas.length) qs.set('areas', f.areas.join(','))
  if (f.departmentIds.length) qs.set('department_ids', f.departmentIds.join(','))
  if (f.delayedOnly) qs.set('delayed_only', 'true')
  if (f.dateFrom) qs.set('date_from', f.dateFrom)
  if (f.dateTo) qs.set('date_to', f.dateTo)
  qs.set('sort', sort)
  qs.set('page', String(page))
  qs.set('per_page', String(perPage))
  return qs.toString()
}

export function hasAnyProjectFilter(f: ProjectFilters): boolean {
  return !!(f.q.trim() || f.statuses.length || f.managerIds.length || f.companyIds.length
    || f.areas.length || f.departmentIds.length || f.delayedOnly || f.dateFrom || f.dateTo)
}

/**
 * 案件一覧（サーバー側で絞り込み・並び替え・ページネーション）。
 * queryKey に全条件・page・per_page・並び順を含めるため、条件が変われば必ず取り直す。
 */
export function useProjectSearch(
  f: ProjectFilters, page: number, perPage: number, sort: ProjectSort,
) {
  const query = projectSearchQuery(f, page, perPage, sort)
  return useQuery({
    queryKey: ['projects', 'search', query],
    queryFn: () => api<ProjectSearchResponse>(`/projects/search?${query}`),
  })
}

export function useProjectFilterOptions() {
  return useQuery({
    queryKey: ['projects', 'filter-options'],
    queryFn: () => api<ProjectFilterOptions>('/projects/filter-options'),
  })
}

export function useProjects(params?: { status?: string; q?: string }) {
  const qs = new URLSearchParams()
  if (params?.status && params.status !== 'all') qs.set('status', params.status)
  if (params?.q) qs.set('q', params.q)
  const suffix = qs.toString() ? `?${qs.toString()}` : ''
  return useQuery({
    queryKey: ['projects', params?.status ?? 'all', params?.q ?? ''],
    queryFn: () => api<ApiProject[]>(`/projects${suffix}`),
  })
}

export function useProject(id: number | undefined) {
  return useQuery({
    queryKey: ['project', id],
    queryFn: () => api<ApiProject>(`/projects/${id}`),
    enabled: !!id,
  })
}

export function useCreateProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: ProjectCreateInput) => api<ApiProject>('/projects', { method: 'POST', body: input }),
    onSuccess: async (created) => {
      // 案件一覧は条件・ページ・並び順ごとに別のQuery Keyを持つ。prefix ['projects'] で
      // 検索結果・選択肢をまとめて stale 化し、表示中のものは即座に取り直す。
      await qc.invalidateQueries({ queryKey: ['projects'] })
      await qc.refetchQueries({ queryKey: ['projects'], type: 'active' })
      qc.setQueryData(['project', created.id], created)
    },
  })
}

export function useUpdateProject(id: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: Partial<ProjectCreateInput>) => api<ApiProject>(`/projects/${id}`, { method: 'PUT', body: input }),
    onSuccess: async (updated) => {
      // 一覧（全条件・全ページ）と詳細の両方へ即時反映する
      await qc.invalidateQueries({ queryKey: ['projects'] })
      await qc.refetchQueries({ queryKey: ['projects'], type: 'active' })
      qc.setQueryData(['project', id], updated)
      await qc.invalidateQueries({ queryKey: ['project', id] })
    },
  })
}
