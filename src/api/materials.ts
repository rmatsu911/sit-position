import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/apiClient'

// バックエンド ProjectMaterialOut に対応
export interface ProjectMaterial {
  id: number
  project_id: number
  material_id: number
  name: string
  code: string | null
  model_number: string | null
  manufacturer: string | null
  unit: string | null
  task_id: number | null
  task: string | null
  qty_planned: number | null
  qty_used: number | null
  arrival_planned: string | null
  arrival_actual: string | null
  status: string | null
}

export interface MaterialCreateInput {
  project_id: number
  name: string
  code?: string
  model_number?: string
  manufacturer?: string
  unit?: string
  task_id?: number | null
  qty_planned?: number | null
  qty_used?: number | null
  arrival_planned?: string | null
  arrival_actual?: string | null
  status?: string
}

export function useProjectMaterials(projectId: number | undefined) {
  return useQuery({
    queryKey: ['materials', projectId],
    enabled: !!projectId,
    queryFn: () => api<ProjectMaterial[]>(`/materials?project_id=${projectId}`),
  })
}

export function useCreateMaterial() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: MaterialCreateInput) => api<ProjectMaterial>('/materials', { method: 'POST', body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['materials'] }),
  })
}
