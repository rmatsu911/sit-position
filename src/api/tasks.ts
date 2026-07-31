import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/apiClient'
import { durationInDays, endAtOf, jstDateKey, startAtOf } from '../lib/timeline'
import type { WbsTask } from '../types'

// バックエンド TaskOut に対応
export interface ApiTask {
  id: number
  project_id: number
  parent_task_id: number | null
  wbs_code: string | null
  name: string
  work_type: string | null
  process_type: string | null
  crew: string | null
  manager: string | null
  manager_id: number | null
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
}

const CRITICAL_NAMES = new Set([
  '敷設・設置工', '光ケーブル敷設', 'クロージャ設置', '接続・試験工', '光ファイバ融着',
  '接続損失測定', '光成端', '切替工', '切替作業', '通信試験', '完成検査', '引き渡し',
])

// API のタスクを既存ガント用 WbsTask 形式へ変換。
// 日時は丸めずそのまま保持する（0.5日=午前/午後を表現するため）。
export function toWbsTasks(rows: ApiTask[]): WbsTask[] {
  const sorted = [...rows].sort((a, b) => (a.wbs_code ?? '').localeCompare(b.wbs_code ?? '', 'en', { numeric: true }))
  const wbsById = new Map(rows.map((t) => [t.id, t.wbs_code ?? String(t.id)]))
  return sorted.map((t) => {
    const wbs = t.wbs_code ?? String(t.id)
    const isParent = !wbs.includes('.')
    const predecessors = t.dependencies.map((id) => wbsById.get(id)).filter((v): v is string => !!v)
    // 日時が無い工程は「今日1日」として扱う（バーを描けない状態を作らない）
    const fallbackStart = startAtOf(jstDateKey(new Date()), 'AM')
    const planStartAt = t.planned_start_at ?? fallbackStart
    const planEndAt = t.planned_finish_at ?? endAtOf(jstDateKey(planStartAt), 'PM')
    return {
      id: String(t.id),
      wbs,
      name: t.name,
      workType: t.work_type ?? '—',
      crew: t.crew ?? '—',
      manager: t.manager ?? '—',
      planStartAt,
      planEndAt,
      actualStartAt: t.actual_start_at,
      actualEndAt: t.actual_finish_at,
      precision: (t.schedule_precision as WbsTask['precision']) ?? 'day',
      planDays: durationInDays(planStartAt, planEndAt),
      progress: t.actual_progress,
      planPeople: t.planned_workers,
      actualPeople: t.actual_workers,
      status: t.status as WbsTask['status'],
      predecessors,
      level: isParent ? 0 : 1,
      isParent,
      isMilestone: t.name === '引き渡し',
      critical: CRITICAL_NAMES.has(t.name),
    }
  })
}

export function useProjectTasks(projectId: number | undefined) {
  return useQuery({
    queryKey: ['tasks', projectId],
    queryFn: async () => toWbsTasks(await api<ApiTask[]>(`/projects/${projectId}/tasks`)),
    enabled: !!projectId,
  })
}

export interface TaskWriteInput {
  parent_task_id?: number | null
  site_id?: number | null
  wbs_code?: string | null
  name: string
  planned_start_at?: string | null
  planned_finish_at?: string | null
  actual_start_at?: string | null
  actual_finish_at?: string | null
  planned_progress?: number
  actual_progress?: number
  planned_workers?: number
  actual_workers?: number
  manager_id?: number | null
  company_id?: number | null
  status?: string
  delay_reason?: string | null
  notes?: string | null
  schedule_precision?: string
  dependency_ids?: number[]
  change_reason?: string
}

/**
 * 工程の更新（PUT /tasks/{id}）。案件工程・横断工程の両方がこの1本を使う。
 * 更新処理・監査ログを画面ごとに複製しないための共通入口。
 */
export function updateTaskRequest(id: number, input: TaskWriteInput) {
  return api<ApiTask>(`/tasks/${id}`, { method: 'PUT', body: input })
}

export function invalidateTasks(qc: ReturnType<typeof useQueryClient>, projectId: number) {
  return Promise.all([
    qc.invalidateQueries({ queryKey: ['tasks', projectId] }),
    qc.invalidateQueries({ queryKey: ['task-options', projectId] }),
    qc.invalidateQueries({ queryKey: ['dashboard'] }),
    qc.invalidateQueries({ queryKey: ['project', projectId] }),
    qc.invalidateQueries({ queryKey: ['cross-schedule'] }),
  ])
}

export function useCreateTask(projectId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: TaskWriteInput) =>
      api<ApiTask>(`/projects/${projectId}/tasks`, { method: 'POST', body: input }),
    onSuccess: async () => { await invalidateTasks(qc, projectId) },
  })
}

export function useUpdateTask(projectId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...input }: TaskWriteInput & { id: number }) => updateTaskRequest(id, input),
    onSuccess: async () => { await invalidateTasks(qc, projectId) },
  })
}

export function useDeleteTask(projectId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api<void>(`/tasks/${id}`, { method: 'DELETE' }),
    onSuccess: async () => { await invalidateTasks(qc, projectId) },
  })
}

export interface TaskOption {
  id: number
  wbs: string
  name: string
  actual_progress: number
  planned_progress: number
  status: string
}

// 工程選択用（Site→Task 連動＋Asset連動、日報の実施工程紐付けにも利用）
export function useTaskOptions(projectId: number | undefined, siteId?: number, assetId?: number) {
  return useQuery({
    queryKey: ['task-options', projectId, siteId ?? null, assetId ?? null],
    enabled: !!projectId,
    queryFn: async () => {
      const qs = new URLSearchParams()
      if (siteId) qs.set('site_id', String(siteId))
      if (assetId) qs.set('asset_id', String(assetId))
      const suffix = qs.toString() ? `?${qs.toString()}` : ''
      const rows = await api<ApiTask[]>(`/projects/${projectId}/tasks${suffix}`)
      return rows
        .filter((t) => (t.wbs_code ?? '').includes('.')) // 子工程のみ（実作業単位）
        .map<TaskOption>((t) => ({
          id: t.id, wbs: t.wbs_code ?? String(t.id), name: t.name,
          actual_progress: t.actual_progress, planned_progress: t.planned_progress, status: t.status,
        }))
    },
  })
}
