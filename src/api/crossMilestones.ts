/**
 * 横断マイルストーンのAPIクライアント。
 *
 * 一覧・選択肢・件数・CRUD・出力はすべて backend の同じ集約処理を通る。
 * 画面側で件数を数え直したり、独自の抽出をしたりしない。
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/apiClient'
import { downloadFile } from './reports'

/** バックエンド MilestoneOut に対応。 */
export interface CrossMilestone {
  record_kind: 'milestone'
  id: number
  project_id: number
  project_name: string
  project_number: string
  construction_type_id: number | null
  construction_type: string | null
  department_id: number | null
  department: string | null
  milestone_type_id: number | null
  milestone_type: string | null
  milestone_type_order: number
  name: string
  planned_at: string | null
  actual_at: string | null
  status: string
  responsible_id: number | null
  responsible: string | null
  company_id: number | null
  company: string | null
  related_task_id: number | null
  related_task_wbs: string | null
  related_task_name: string | null
  schedule_precision: string
  notes: string | null
  // ここから下は確定計算の結果（DBの status とは別物）
  is_completed: boolean
  is_overdue: boolean
  was_delayed: boolean
  delay_days: number
  remaining_days: number | null
  is_due_soon: boolean
  actual_missing: boolean
  related_task_conflict: boolean
}

/** まだ登録されていない標準種別。実レコードではない。 */
export interface MilestoneCandidate {
  record_kind: 'candidate'
  project_id: number
  project_name: string
  project_number: string
  milestone_type_id: number
  milestone_type: string
  milestone_type_order: number
}

export interface MilestoneListResponse {
  milestones: CrossMilestone[]
  candidates: MilestoneCandidate[]
  registered_count: number
  candidate_count: number
  total: number
  returned_count: number
  truncated: boolean
  limit: number
  calculated_at: string
  due_soon_days: number
}

export interface MilestoneSummary {
  calculated_at: string
  due_soon_days: number
  registered_count: number
  candidate_count: number
  completed: number
  overdue: number
  due_soon: number
  was_delayed: number
  actual_missing: number
  related_task_conflict: number
}

export interface IdName { id: number; name: string }

export interface MilestoneOptions {
  projects: { id: number; name: string; construction_number: string; status: string }[]
  milestone_types: IdName[]
  statuses: string[]
  responsibles: IdName[]
  companies: IdName[]
  related_tasks: { id: number; wbs_code: string | null; name: string; project_id: number }[]
  calculated_at: string
}

/** 絞り込み条件。URLクエリと1対1で対応する。 */
export interface MilestoneFilters {
  q: string
  projectIds: number[]
  milestoneTypeIds: number[]
  statuses: string[]
  responsibleIds: number[]
  companyIds: number[]
  relatedTaskIds: number[]
  dateFrom: string
  dateTo: string
  actual: '' | 'entered' | 'missing'
  overdueOnly: boolean
  dueSoonOnly: boolean
  conflictOnly: boolean
  dueSoonDays: number
  limit: number
}

export const EMPTY_MILESTONE_FILTERS: MilestoneFilters = {
  q: '', projectIds: [], milestoneTypeIds: [], statuses: [], responsibleIds: [],
  companyIds: [], relatedTaskIds: [], dateFrom: '', dateTo: '', actual: '',
  overdueOnly: false, dueSoonOnly: false, conflictOnly: false, dueSoonDays: 7, limit: 1000,
}

export const DEFAULT_DUE_SOON_DAYS = 7
export const DEFAULT_MILESTONE_LIMIT = 1000

/** 絞り込み条件をAPIのクエリ文字列へ。画面だけの条件は作らない。 */
export function milestoneQuery(
  f: MilestoneFilters,
  extra?: { projectId?: number; group?: string; includeCandidates?: boolean },
): string {
  const qs = new URLSearchParams()
  if (extra?.projectId) qs.set('project_id', String(extra.projectId))
  if (f.q.trim()) qs.set('q', f.q.trim())
  if (f.projectIds.length) qs.set('project_ids', f.projectIds.join(','))
  if (f.milestoneTypeIds.length) qs.set('milestone_type_ids', f.milestoneTypeIds.join(','))
  if (f.statuses.length) qs.set('statuses', f.statuses.join(','))
  if (f.responsibleIds.length) qs.set('responsible_ids', f.responsibleIds.join(','))
  if (f.companyIds.length) qs.set('company_ids', f.companyIds.join(','))
  if (f.relatedTaskIds.length) qs.set('related_task_ids', f.relatedTaskIds.join(','))
  if (f.dateFrom) qs.set('date_from', f.dateFrom)
  if (f.dateTo) qs.set('date_to', f.dateTo)
  if (f.actual) qs.set('actual', f.actual)
  if (f.overdueOnly) qs.set('overdue_only', 'true')
  if (f.dueSoonOnly) qs.set('due_soon_only', 'true')
  if (f.conflictOnly) qs.set('conflict_only', 'true')
  if (f.dueSoonDays !== DEFAULT_DUE_SOON_DAYS) qs.set('due_soon_days', String(f.dueSoonDays))
  if (f.limit !== DEFAULT_MILESTONE_LIMIT) qs.set('limit', String(f.limit))
  if (extra?.group) qs.set('group', extra.group)
  if (extra?.includeCandidates === false) qs.set('include_candidates', 'false')
  return qs.toString()
}

export function hasAnyMilestoneFilter(f: MilestoneFilters): boolean {
  return milestoneQuery(f).length > 0
}

export function useCrossMilestones(f: MilestoneFilters, group: string, projectId?: number) {
  const query = milestoneQuery(f, { projectId, group })
  return useQuery({
    queryKey: ['cross-milestones', query],
    queryFn: () => api<MilestoneListResponse>(`/schedule/milestones${query ? `?${query}` : ''}`),
  })
}

export function useMilestoneSummary(f: MilestoneFilters, group: string, projectId?: number) {
  const query = milestoneQuery(f, { projectId, group })
  return useQuery({
    queryKey: ['cross-milestones-summary', query],
    queryFn: () => api<MilestoneSummary>(`/schedule/milestones/summary${query ? `?${query}` : ''}`),
  })
}

export function useMilestoneOptions(projectId?: number) {
  return useQuery({
    queryKey: ['cross-milestones-options', projectId ?? null],
    queryFn: () => api<MilestoneOptions>(
      `/schedule/milestones/options${projectId ? `?project_id=${projectId}` : ''}`,
    ),
  })
}

export function downloadMilestones(
  f: MilestoneFilters,
  format: 'xlsx' | 'pdf',
  extra?: { projectId?: number; group?: string },
): Promise<void> {
  const query = milestoneQuery(f, extra)
  return downloadFile(
    `/schedule/milestones/export?format=${format}${query ? `&${query}` : ''}`,
    `cross_milestones.${format}`,
  )
}

// ===== 登録・更新・削除 =====
export interface MilestoneWriteInput {
  project_id?: number
  milestone_type_id?: number | null
  name?: string
  planned_at?: string | null
  actual_at?: string | null
  status?: string
  responsible_id?: number | null
  company_id?: number | null
  related_task_id?: number | null
  schedule_precision?: string
  notes?: string | null
  change_reason?: string
}

/** 保存後は一覧・件数・選択肢・未設定候補をまとめて取り直す。 */
function invalidateMilestones(qc: ReturnType<typeof useQueryClient>) {
  return Promise.all([
    qc.invalidateQueries({ queryKey: ['cross-milestones'] }),
    qc.invalidateQueries({ queryKey: ['cross-milestones-summary'] }),
    qc.invalidateQueries({ queryKey: ['cross-milestones-options'] }),
  ])
}

export function useCreateMilestone() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: MilestoneWriteInput) =>
      api<CrossMilestone>('/schedule/milestones', { method: 'POST', body: input }),
    onSuccess: () => invalidateMilestones(qc),
  })
}

export function useUpdateMilestone() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...input }: MilestoneWriteInput & { id: number }) =>
      api<CrossMilestone>(`/schedule/milestones/${id}`, { method: 'PUT', body: input }),
    onSuccess: () => invalidateMilestones(qc),
  })
}

export function useDeleteMilestone() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, reason }: { id: number; reason?: string }) =>
      api<void>(`/schedule/milestones/${id}${reason ? `?reason=${encodeURIComponent(reason)}` : ''}`,
        { method: 'DELETE' }),
    onSuccess: () => invalidateMilestones(qc),
  })
}

// ===== 保存検索条件（既存の saved_searches を screen で使い分ける） =====
const SCREEN = 'cross_milestones'

export interface SavedMilestoneSearch {
  id: number
  screen: string
  name: string
  conditions: Partial<MilestoneFilters> & { view?: string; group?: string; scale?: string }
  created_at: string | null
  updated_at: string | null
}

export function useSavedMilestoneSearches() {
  return useQuery({
    queryKey: ['saved-searches', SCREEN],
    queryFn: () => api<SavedMilestoneSearch[]>(`/schedule/saved-searches?screen=${SCREEN}`),
  })
}

export function useSaveMilestoneSearch() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, name, conditions }: { id?: number; name: string; conditions: object }) =>
      id
        ? api<SavedMilestoneSearch>(`/schedule/saved-searches/${id}`, { method: 'PUT', body: { name, conditions } })
        : api<SavedMilestoneSearch>('/schedule/saved-searches', {
            method: 'POST', body: { screen: SCREEN, name, conditions },
          }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['saved-searches', SCREEN] }),
  })
}

export function useDeleteMilestoneSearch() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api<void>(`/schedule/saved-searches/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['saved-searches', SCREEN] }),
  })
}
