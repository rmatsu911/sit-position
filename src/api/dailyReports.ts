import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/apiClient'
import type { DailyReport, ReportStatus } from '../types'

// DB(英語) ⇔ フロント(日本語) のステータス対応
const TO_JP: Record<string, ReportStatus> = {
  DRAFT: '下書き', SUBMITTED: '提出済み', REVIEWING: '確認中', RETURNED: '差し戻し', APPROVED: '承認済み',
}
const TO_EN: Record<ReportStatus, string> = {
  下書き: 'DRAFT', 提出済み: 'SUBMITTED', 確認中: 'REVIEWING', 差し戻し: 'RETURNED', 承認済み: 'APPROVED',
}
export function reportStatusToEn(s: ReportStatus): string {
  return TO_EN[s] ?? 'DRAFT'
}

// バックエンド DailyReportOut に対応
export interface ApiDailyReport {
  id: number
  project_id: number
  site_id: number | null
  report_date: string
  weather: string | null
  temperature: string | null
  place: string | null
  crew: string | null
  manager: string | null
  start_time: string | null
  finish_time: string | null
  plan_workers: number | null
  actual_workers: number | null
  work_description: string | null
  process: string | null
  materials: string | null
  tools: string | null
  vehicles: string | null
  ky_description: string | null
  hazard: string | null
  safety_check: string | null
  quality_check: string | null
  problem: string | null
  next_day_plan: string | null
  note: string | null
  author: string | null
  checker: string | null
  approver: string | null
  status: string
  task_ids: number[]
  photo_ids: number[]
}

export function toDailyReport(r: ApiDailyReport): DailyReport {
  return {
    id: String(r.id),
    projectId: `p${r.project_id}`,
    date: r.report_date,
    weather: r.weather ?? '',
    temperature: r.temperature ?? '',
    place: r.place ?? '',
    crew: r.crew ?? '',
    manager: r.manager ?? '',
    startTime: r.start_time ?? '',
    endTime: r.finish_time ?? '',
    planPeople: r.plan_workers ?? 0,
    actualPeople: r.actual_workers ?? 0,
    work: r.work_description ?? '',
    process: r.process ?? '',
    materials: r.materials ?? '',
    tools: r.tools ?? '',
    vehicles: r.vehicles ?? '',
    kyContent: r.ky_description ?? '',
    hazard: r.hazard ?? '',
    safetyCheck: r.safety_check ?? '',
    qualityCheck: r.quality_check ?? '',
    problem: r.problem ?? '',
    tomorrow: r.next_day_plan ?? '',
    note: r.note ?? '',
    author: r.author ?? '',
    checker: r.checker ?? '',
    approver: r.approver ?? '',
    status: TO_JP[r.status] ?? '下書き',
    taskIds: r.task_ids ?? [],
    photoIds: r.photo_ids ?? [],
  }
}

// フロント DailyReport → API Upsert ボディ
export function toUpsertBody(r: DailyReport, projectId: number) {
  return {
    project_id: projectId,
    report_date: r.date,
    weather: r.weather || null,
    temperature: r.temperature || null,
    place: r.place || null,
    crew: r.crew || null,
    start_time: r.startTime || null,
    finish_time: r.endTime || null,
    plan_workers: r.planPeople ?? null,
    actual_workers: r.actualPeople ?? null,
    work_description: r.work || null,
    process: r.process || null,
    materials: r.materials || null,
    tools: r.tools || null,
    vehicles: r.vehicles || null,
    ky_description: r.kyContent || null,
    hazard: r.hazard || null,
    safety_check: r.safetyCheck || null,
    quality_check: r.qualityCheck || null,
    problem: r.problem || null,
    next_day_plan: r.tomorrow || null,
    note: r.note || null,
  }
}

/** 選択中の案件の日報。未選択のときは取得しない。 */
export function useDailyReports(projectId: number | undefined) {
  return useQuery({
    queryKey: ['daily-reports', projectId ?? null],
    queryFn: async () => (await api<ApiDailyReport[]>(`/daily-reports?project_id=${projectId}`)).map(toDailyReport),
    enabled: !!projectId,
  })
}

export function useSaveDailyReport() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ report, projectId }: { report: DailyReport; projectId: number }) =>
      api<ApiDailyReport>(`/daily-reports/${report.id}`, { method: 'PUT', body: toUpsertBody(report, projectId) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['daily-reports'] }),
  })
}

export function useCreateDailyReport() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: ReturnType<typeof toUpsertBody>) => api<ApiDailyReport>('/daily-reports', { method: 'POST', body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['daily-reports'] }),
  })
}

export function useCopyDailyReport() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string | number) => api<ApiDailyReport>(`/daily-reports/${id}/copy`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['daily-reports'] }),
  })
}

export function useChangeDailyReportStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { id: string | number; status: ReportStatus }) =>
      api<ApiDailyReport>(`/daily-reports/${input.id}/status`, { method: 'PATCH', body: { status: reportStatusToEn(input.status) } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['daily-reports'] }),
  })
}

// 写真/工程 紐付け
export function useSetDailyReportLinks() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { id: string | number; task_ids?: number[]; photo_ids?: number[] }) => {
      const { id, ...body } = input
      return api<ApiDailyReport>(`/daily-reports/${id}/links`, { method: 'PUT', body })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['daily-reports'] }),
  })
}

// 工程実績反映のプレビュー/確定（POST /reflect-progress）
export interface ReflectTarget {
  task_id: number
  wbs_code: string | null
  task_name: string
  current_progress: number
  progress_after: number
  planned_progress: number
  changes: { field: string; label: string; from: number | string | null; to: number | string | null }[]
}
export interface ReflectResult {
  report_id: number
  dry_run: boolean
  reflected_tasks: number
  total_changes: number
  targets: ReflectTarget[]
}

export function reflectProgress(id: string | number, dryRun: boolean): Promise<ReflectResult> {
  return api<ReflectResult>(`/daily-reports/${id}/reflect-progress?dry_run=${dryRun}`, { method: 'POST' })
}

export function useReflectProgress() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string | number) => reflectProgress(id, false),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] })
      qc.invalidateQueries({ queryKey: ['task-options'] })
    },
  })
}
