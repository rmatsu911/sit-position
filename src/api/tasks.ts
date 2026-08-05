import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/apiClient'
import { durationInDays } from '../lib/timeline'
import type { WbsTask } from '../types'

// バックエンド TaskOut に対応
export interface ApiTask {
  id: number
  project_id: number
  parent_task_id: number | null
  wbs_code: string | null
  name: string
  work_type: string | null
  work_type_id: number | null
  process_type: string | null
  process_type_id: number | null
  crew: string | null
  team_id: number | null
  manager: string | null
  manager_id: number | null
  company: string | null
  company_id: number | null
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

/**
 * API のタスクを既存ガント用 WbsTask 形式へ変換する。
 *
 * - 親子は `parent_task_id` が正本。WBSコードは表示順・識別のためだけに使う。
 * - 階層は2段に限定せず、親をたどった深さをそのまま `level` にする。
 * - 日程が未設定の工程は **架空の日付で埋めない**（null のまま）。
 * - 日時は丸めずそのまま保持する（0.5日=午前/午後を表現するため）。
 */
export function toWbsTasks(rows: ApiTask[]): WbsTask[] {
  const byId = new Map(rows.map((t) => [t.id, t]))
  const wbsById = new Map(rows.map((t) => [t.id, t.wbs_code ?? String(t.id)]))
  const childIds = new Set(rows.map((t) => t.parent_task_id).filter((v): v is number => v != null))

  // 親をたどった深さ。循環していても止まるように上限を設ける。
  const depthOf = (t: ApiTask): number => {
    let depth = 0
    let cur = t.parent_task_id != null ? byId.get(t.parent_task_id) : undefined
    while (cur && depth < 20) {
      depth += 1
      cur = cur.parent_task_id != null ? byId.get(cur.parent_task_id) : undefined
    }
    return depth
  }

  // 表示順は WBS の数値順（同階層で 2 < 10 になるように）
  const wbsKey = (t: ApiTask) => (t.wbs_code ?? String(t.id))
  const sorted = [...rows].sort((a, b) => wbsKey(a).localeCompare(wbsKey(b), 'en', { numeric: true }))

  return sorted.map((t) => {
    const predecessors = t.dependencies.map((id) => wbsById.get(id)).filter((v): v is string => !!v)
    const planStartAt = t.planned_start_at
    const planEndAt = t.planned_finish_at
    return {
      id: String(t.id),
      wbs: t.wbs_code ?? String(t.id),
      name: t.name,
      workType: t.work_type ?? '—',
      crew: t.crew ?? '—',
      manager: t.manager ?? '—',
      planStartAt,
      planEndAt,
      actualStartAt: t.actual_start_at,
      actualEndAt: t.actual_finish_at,
      precision: (t.schedule_precision as WbsTask['precision']) ?? 'day',
      // 日程が揃っている工程だけ日数を出す（未設定を0日や1日に丸めない）
      planDays: planStartAt && planEndAt ? durationInDays(planStartAt, planEndAt) : null,
      planProgress: t.planned_progress,
      progress: t.actual_progress,
      planPeople: t.planned_workers,
      actualPeople: t.actual_workers,
      status: t.status as WbsTask['status'],
      predecessors,
      predecessorIds: t.dependencies.map(String),
      notes: t.notes,
      delayReason: t.delay_reason,
      workTypeId: t.work_type_id,
      processTypeId: t.process_type_id,
      teamId: t.team_id,
      managerId: t.manager_id,
      companyId: t.company_id,
      parentId: t.parent_task_id != null ? String(t.parent_task_id) : null,
      level: depthOf(t),
      isParent: childIds.has(t.id),
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
  work_type_id?: number | null
  process_type_id?: number | null
  team_id?: number | null
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

/** 工程の追加。登録先の案件が決まっていないときは実行しない（既定値で登録しない）。 */
export function useCreateTask(projectId: number | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: TaskWriteInput) => {
      if (!projectId) throw new Error('対象の案件が選択されていません')
      return api<ApiTask>(`/projects/${projectId}/tasks`, { method: 'POST', body: input })
    },
    onSuccess: async () => { if (projectId) await invalidateTasks(qc, projectId) },
  })
}

export function useUpdateTask(projectId: number | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...input }: TaskWriteInput & { id: number }) => updateTaskRequest(id, input),
    onSuccess: async () => { if (projectId) await invalidateTasks(qc, projectId) },
  })
}

export function useDeleteTask(projectId: number | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api<void>(`/tasks/${id}`, { method: 'DELETE' }),
    onSuccess: async () => { if (projectId) await invalidateTasks(qc, projectId) },
  })
}

export interface IdName { id: number; name: string }

/** 工程フォームの選択肢。画面に固定の一覧を持たず、APIの実データだけを使う。 */
export interface TaskFormOptions {
  work_types: IdName[]
  process_types: IdName[]
  teams: IdName[]
  managers: IdName[]
  companies: IdName[]
}

export function useTaskFormOptions(projectId: number | undefined) {
  return useQuery({
    queryKey: ['task-form-options', projectId],
    enabled: !!projectId,
    queryFn: () => api<TaskFormOptions>(`/projects/${projectId}/task-form-options`),
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
      // 実作業の単位＝末端工程（子を持たない工程）。WBSのドット有無では判定しない。
      const parentIds = new Set(rows.map((t) => t.parent_task_id).filter((v): v is number => v != null))
      return rows
        .filter((t) => !parentIds.has(t.id))
        .map<TaskOption>((t) => ({
          id: t.id, wbs: t.wbs_code ?? String(t.id), name: t.name,
          actual_progress: t.actual_progress, planned_progress: t.planned_progress, status: t.status,
        }))
    },
  })
}
