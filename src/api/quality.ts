import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/apiClient'
import type { QualityItem, QualityJudge, QualityStatus } from '../types'
import { DEMO_PROJECT_ID } from './photos'

// バックエンド QualityCheckOut に対応
export interface ApiQualityCheck {
  id: number
  project_id: number
  site_id: number | null
  asset_id: number | null
  task_id: number | null
  photo_id: number | null
  rule_id: number | null
  inspect_item: string | null
  process: string | null
  judge: string
  worker: string | null
  checker: string | null
  due_date: string | null
  ai_result: string | null
  human_result: string | null
  status: string
  comment: string | null
  updated_at: string | null
  photo_thumbnail_url: string | null
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

export function toQualityItem(c: ApiQualityCheck): QualityItem {
  return {
    id: String(c.id),
    projectId: `p${c.project_id}`,
    process: c.process ?? '—',
    inspectItem: c.inspect_item ?? '—',
    photoId: c.photo_id != null ? String(c.photo_id) : '',
    judge: (c.judge as QualityJudge) ?? '未判定',
    comment: c.comment ?? '',
    worker: c.worker ?? '—',
    checker: c.checker ?? '',
    updatedAt: fmtDateTime(c.updated_at),
    dueDate: c.due_date ?? '',
    status: (c.status as QualityStatus) ?? '確認待ち',
  }
}

export function useQualityChecks(projectId: number = DEMO_PROJECT_ID) {
  return useQuery({
    queryKey: ['quality', projectId],
    queryFn: async () => (await api<ApiQualityCheck[]>(`/quality-checks?project_id=${projectId}`)).map(toQualityItem),
  })
}

export function useUpdateQualityCheck() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { id: string | number; status?: QualityStatus; judge?: QualityJudge; comment?: string }) => {
      const { id, ...body } = input
      return api<ApiQualityCheck>(`/quality-checks/${id}`, { method: 'PATCH', body })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['quality'] }),
  })
}
