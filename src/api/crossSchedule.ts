/**
 * 横断工程表のAPIクライアント。
 *
 * 工程の更新は案件工程と同じ `updateTaskRequest`（PUT /tasks/{id}）を使い、
 * 更新処理・監査ログを画面ごとに複製しない。
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/apiClient'
import { durationInDays } from '../lib/timeline'
import type { SchedulePrecision, WbsTask } from '../types'
import { invalidateTasks, updateTaskRequest, type TaskWriteInput } from './tasks'
import { downloadFile } from './reports'

/** バックエンド CrossTaskOut に対応。 */
export interface CrossTask {
  id: number
  project_id: number
  project_name: string
  project_number: string
  construction_type_id: number | null
  construction_type: string | null
  department_id: number | null
  department: string | null
  parent_task_id: number | null
  wbs_code: string | null
  name: string
  work_type: string | null
  process_type: string | null
  manager_id: number | null
  manager: string | null
  company_id: number | null
  company: string | null
  site_id: number | null
  planned_start_at: string | null
  planned_finish_at: string | null
  actual_start_at: string | null
  actual_finish_at: string | null
  planned_progress: number
  actual_progress: number
  planned_workers: number
  actual_workers: number
  status: string
  delay_reason: string | null
  notes: string | null
  schedule_precision: string
  dependencies: number[]
  is_delayed: boolean
  /** 絞り込みに一致した工程か。false は WBS の親子関係を保つために補われた祖先。 */
  matched: boolean
}

/** 確定計算による検知結果。AI予測ではない。 */
export interface SystemDetection {
  kind: string
  label: string
  severity: 'high' | 'medium' | 'low'
  message: string
  task_ids: number[]
}

export interface CrossScheduleResponse {
  tasks: CrossTask[]
  total: number
  truncated: boolean
  limit: number
  range_from: string | null
  range_to: string | null
  detections: SystemDetection[]
}

export interface IdName { id: number; name: string }

export interface CrossScheduleOptions {
  projects: {
    id: number
    name: string
    construction_number: string
    construction_type_id: number | null
    department_id: number | null
    status: string
  }[]
  construction_types: IdName[]
  departments: IdName[]
  managers: IdName[]
  companies: IdName[]
  statuses: string[]
}

/** 絞り込み条件。URLクエリと1対1で対応する。 */
export interface CrossFilters {
  q: string
  dateFrom: string
  dateTo: string
  projectIds: number[]
  constructionTypeIds: number[]
  departmentIds: number[]
  statuses: string[]
  managerIds: number[]
  companyIds: number[]
  delayedOnly: boolean
  unassignedOnly: boolean
}

export const EMPTY_FILTERS: CrossFilters = {
  q: '', dateFrom: '', dateTo: '',
  projectIds: [], constructionTypeIds: [], departmentIds: [],
  statuses: [], managerIds: [], companyIds: [],
  delayedOnly: false, unassignedOnly: false,
}

export function filtersToQuery(f: CrossFilters, projectId?: number): string {
  const qs = new URLSearchParams()
  if (projectId) qs.set('project_id', String(projectId))
  if (f.q.trim()) qs.set('q', f.q.trim())
  if (f.dateFrom) qs.set('date_from', f.dateFrom)
  if (f.dateTo) qs.set('date_to', f.dateTo)
  if (f.projectIds.length) qs.set('project_ids', f.projectIds.join(','))
  if (f.constructionTypeIds.length) qs.set('construction_type_ids', f.constructionTypeIds.join(','))
  if (f.departmentIds.length) qs.set('department_ids', f.departmentIds.join(','))
  if (f.statuses.length) qs.set('statuses', f.statuses.join(','))
  if (f.managerIds.length) qs.set('manager_ids', f.managerIds.join(','))
  if (f.companyIds.length) qs.set('company_ids', f.companyIds.join(','))
  if (f.delayedOnly) qs.set('delayed_only', 'true')
  if (f.unassignedOnly) qs.set('unassigned_only', 'true')
  return qs.toString()
}

/** 条件が1つでも指定されているか（「条件をクリア」の有効判定に使う）。 */
export function hasAnyFilter(f: CrossFilters): boolean {
  return filtersToQuery(f).length > 0
}

export function useCrossSchedule(filters: CrossFilters, projectId?: number) {
  const query = filtersToQuery(filters, projectId)
  return useQuery({
    queryKey: ['cross-schedule', query],
    queryFn: () => api<CrossScheduleResponse>(`/schedule/cross${query ? `?${query}` : ''}`),
  })
}

export function useCrossScheduleOptions() {
  return useQuery({
    queryKey: ['cross-schedule-options'],
    queryFn: () => api<CrossScheduleOptions>('/schedule/cross/options'),
  })
}

export function downloadCrossSchedule(
  filters: CrossFilters,
  format: 'xlsx' | 'pdf',
  projectId?: number,
): Promise<void> {
  const query = filtersToQuery(filters, projectId)
  return downloadFile(
    `/schedule/cross/export?format=${format}${query ? `&${query}` : ''}`,
    `cross_schedule.${format}`,
  )
}

/**
 * 横断工程表からの工程更新。案件工程と同じAPIを呼び、
 * 成功後に横断工程と当該案件のキャッシュを両方更新する。
 */
export interface CrossTaskUpdateVars extends TaskWriteInput {
  id: number
  projectId: number
  /** 楽観更新で画面に先に反映する値。保存に失敗したら元に戻す。 */
  optimistic?: Partial<CrossTask>
}

export function useUpdateCrossTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, projectId: _p, optimistic: _o, ...input }: CrossTaskUpdateVars) =>
      updateTaskRequest(id, input),
    onMutate: async (vars) => {
      if (!vars.optimistic) return { snapshots: [] as [readonly unknown[], unknown][] }
      await qc.cancelQueries({ queryKey: ['cross-schedule'] })
      const snapshots = qc.getQueriesData({ queryKey: ['cross-schedule'] })
      qc.setQueriesData<CrossScheduleResponse>({ queryKey: ['cross-schedule'] }, (old) =>
        old
          ? { ...old, tasks: old.tasks.map((t) => (t.id === vars.id ? { ...t, ...vars.optimistic } : t)) }
          : old,
      )
      return { snapshots }
    },
    // 保存に失敗したら楽観更新を必ず戻す（画面だけ変わった状態を残さない）
    onError: (_err, _vars, context) => {
      for (const [key, data] of context?.snapshots ?? []) qc.setQueryData(key, data)
    },
    onSettled: async (_data, _err, variables) => { await invalidateTasks(qc, variables.projectId) },
  })
}

// ===== 表示用の変換 =====

/**
 * 横断工程を既存ガントの WbsTask 形式へ変換する。
 * 日時は丸めず、そのまま保持する（0.5日=午前/午後を表現するため）。
 */
export function toWbsTask(t: CrossTask, wbsById: Map<number, string>, parentIds: Set<number>): WbsTask | null {
  if (!t.planned_start_at || !t.planned_finish_at) return null
  const wbs = t.wbs_code ?? String(t.id)
  return {
    id: String(t.id),
    wbs,
    name: t.name,
    workType: t.work_type ?? '—',
    crew: t.company ?? '—',
    manager: t.manager ?? '—',
    planStartAt: t.planned_start_at,
    planEndAt: t.planned_finish_at,
    actualStartAt: t.actual_start_at,
    actualEndAt: t.actual_finish_at,
    precision: (t.schedule_precision as SchedulePrecision) ?? 'day',
    planDays: durationInDays(t.planned_start_at, t.planned_finish_at),
    planProgress: t.planned_progress,
    progress: t.actual_progress,
    planPeople: t.planned_workers,
    actualPeople: t.actual_workers,
    status: t.status as WbsTask['status'],
    predecessors: t.dependencies.map((id) => wbsById.get(id)).filter((v): v is string => !!v),
    predecessorIds: t.dependencies.map(String),
    // 横断工程は一覧表示だけで編集フォームを持たないため、詳細項目は保持しない
    notes: null,
    delayReason: null,
    workTypeId: null,
    processTypeId: null,
    teamId: null,
    managerId: null,
    companyId: null,
    level: t.parent_task_id ? 1 : 0,
    // 子工程を持つ工程だけを親として扱う（子の無い最上位工程は通常のバーで描く）
    parentId: t.parent_task_id != null ? String(t.parent_task_id) : null,
    isParent: parentIds.has(t.id),
    critical: false,
  }
}

// ===== 保存検索条件（DBに保存する。localStorage だけでは端末を変えると失われる） =====
export interface SavedSearch {
  id: number
  screen: string
  name: string
  conditions: CrossFilters
  created_at: string | null
  updated_at: string | null
}

const SCREEN = 'cross_schedule'

export function useSavedSearches() {
  return useQuery({
    queryKey: ['saved-searches', SCREEN],
    queryFn: () => api<SavedSearch[]>(`/schedule/saved-searches?screen=${SCREEN}`),
  })
}

export function useCreateSavedSearch() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { name: string; conditions: CrossFilters }) =>
      api<SavedSearch>('/schedule/saved-searches', { method: 'POST', body: { screen: SCREEN, ...input } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['saved-searches', SCREEN] }),
  })
}

export function useDeleteSavedSearch() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api<void>(`/schedule/saved-searches/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['saved-searches', SCREEN] }),
  })
}
