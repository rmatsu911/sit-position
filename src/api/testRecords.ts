import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/apiClient'

// バックエンド TestRecordOut に対応
export interface TestRecord {
  id: number
  project_id: number
  site_id: number | null
  asset_id: number | null
  asset: string | null
  task_id: number | null
  task: string | null
  test_type: string
  measured_at: string | null
  tester: string | null
  measured_value: string | null
  unit: string | null
  standard_value: string | null
  judge: string
  instrument: string | null
  attachment_url: string | null
  comment: string | null
}

export interface TestRecordCreateInput {
  project_id: number
  site_id?: number | null
  asset_id?: number | null
  task_id?: number | null
  test_type: string
  measured_value?: string
  unit?: string
  standard_value?: string
  judge?: string
  instrument?: string
  comment?: string
}

export function useTestRecords(projectId: number | undefined, filters?: { asset_id?: number; task_id?: number }) {
  return useQuery({
    queryKey: ['test-records', projectId ?? null, filters?.asset_id ?? null, filters?.task_id ?? null],
    queryFn: () => {
      const qs = new URLSearchParams({ project_id: String(projectId) })
      if (filters?.asset_id) qs.set('asset_id', String(filters.asset_id))
      if (filters?.task_id) qs.set('task_id', String(filters.task_id))
      return api<TestRecord[]>(`/test-records?${qs.toString()}`)
    },
    enabled: !!projectId,
  })
}

export function useCreateTestRecord() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: TestRecordCreateInput) => api<TestRecord>('/test-records', { method: 'POST', body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['test-records'] }),
  })
}
