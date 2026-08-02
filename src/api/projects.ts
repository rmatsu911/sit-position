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
      // 案件一覧は status/q ごとに複数のQuery Keyを持つ。prefixで全派生一覧を
      // stale化し、表示中一覧はPOST完了後に再取得してCREATE→LISTを保証する。
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects'] })
      qc.invalidateQueries({ queryKey: ['project', id] })
    },
  })
}
