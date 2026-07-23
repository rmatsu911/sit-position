import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/apiClient'
import type { WbsTask } from '../types'

// バックエンド TaskOut に対応
interface ApiTask {
  id: number
  project_id: number
  parent_task_id: number | null
  wbs_code: string | null
  name: string
  work_type: string | null
  process_type: string | null
  crew: string | null
  manager: string | null
  planned_start_at: string | null
  planned_finish_at: string | null
  actual_start_at: string | null
  actual_finish_at: string | null
  planned_progress: number
  actual_progress: number
  planned_workers: number
  actual_workers: number
  status: string
}

const CRITICAL_NAMES = new Set([
  '敷設・設置工', '光ケーブル敷設', 'クロージャ設置', '接続・試験工', '光ファイバ融着',
  '接続損失測定', '光成端', '切替工', '切替作業', '通信試験', '完成検査', '引き渡し',
])

function ymd(iso: string | null): string | null {
  return iso ? iso.slice(0, 10) : null
}

// API のタスクを既存ガント用 WbsTask 形式へ変換（工程 read の表示互換）
export function toWbsTasks(rows: ApiTask[]): WbsTask[] {
  const sorted = [...rows].sort((a, b) => (a.wbs_code ?? '').localeCompare(b.wbs_code ?? '', 'en', { numeric: true }))
  // 先行工程: 同一親内の直前の子工程（依存線の近似表示）
  const prevByParent = new Map<string, string>()
  return sorted.map((t) => {
    const wbs = t.wbs_code ?? String(t.id)
    const isParent = !wbs.includes('.')
    const parentKey = wbs.includes('.') ? wbs.split('.')[0] : '__root__'
    const predecessors: string[] = []
    if (!isParent) {
      const prev = prevByParent.get(parentKey)
      if (prev) predecessors.push(prev)
      prevByParent.set(parentKey, wbs)
    }
    const ps = ymd(t.planned_start_at) ?? '2026-06-01'
    const pe = ymd(t.planned_finish_at) ?? ps
    const planDays = Math.max(
      0,
      Math.round((new Date(pe).getTime() - new Date(ps).getTime()) / 86400000) + 1,
    )
    return {
      id: String(t.id),
      wbs,
      name: t.name,
      workType: t.work_type ?? '—',
      crew: t.crew ?? '—',
      manager: t.manager ?? '—',
      planStart: ps,
      planEnd: pe,
      actualStart: ymd(t.actual_start_at),
      actualEnd: ymd(t.actual_finish_at),
      planDays,
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
