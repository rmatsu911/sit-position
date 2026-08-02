import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/apiClient'
import type { Worker } from '../types'

// バックエンド WorkerOut に対応（フロント Worker とほぼ同形）
export interface ApiWorker {
  id: number
  name: string
  org: string | null
  crew: string | null
  role: string | null
  licenses: string[]
  assignedTo: string | null
  schedule: string[]
  status: string
  continuousDays: number
  vacation: string | null
  note: string | null
}

export function toWorker(w: ApiWorker): Worker {
  return {
    id: String(w.id),
    name: w.name,
    org: w.org ?? '—',
    crew: w.crew ?? '—',
    role: w.role ?? '—',
    licenses: w.licenses ?? [],
    assignedTo: w.assignedTo ?? '待機',
    schedule: (w.schedule ?? []) as Worker['schedule'],
    status: w.status as Worker['status'],
    continuousDays: w.continuousDays,
    vacation: w.vacation ?? '—',
    note: w.note ?? '',
  }
}

export function useWorkers() {
  return useQuery({
    queryKey: ['workers'],
    queryFn: async () => (await api<ApiWorker[]>('/workers')).map(toWorker),
  })
}

export interface ApiWorkerDetail extends ApiWorker {
  company: string | null
  team: string | null
  qualifications: { name: string; acquired_at: string | null; expires_at: string | null; certificate_no: string | null }[]
  assignments: { project_id: number; project: string | null; task_id: number | null; task: string | null; assigned_from: string | null; assigned_to: string | null; role: string | null; status: string | null }[]
}

export function useWorker(id: string | number | undefined) {
  return useQuery({
    queryKey: ['worker', id],
    enabled: id !== undefined,
    queryFn: () => api<ApiWorkerDetail>(`/workers/${id}`),
  })
}

// 要員を案件/工程へ配置（DB永続化）
export function useAssignWorker() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { worker_id: string | number; project_id: number; task_id?: number; assigned_from?: string; assigned_to?: string; role?: string }) => {
      const { worker_id, ...body } = input
      return api<ApiWorkerDetail>(`/workers/${worker_id}/assign`, { method: 'POST', body })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workers'] }),
  })
}

export function useUnassignWorker() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { worker_id: string | number; assignment_id: number }) =>
      api<ApiWorkerDetail>(`/workers/${input.worker_id}/assign/${input.assignment_id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workers'] }),
  })
}
