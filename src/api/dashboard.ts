import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/apiClient'

// バックエンド DashboardSummaryOut に対応
export interface DashboardSummary {
  total: number
  active: number
  delayed: number
  workingToday: number
  finishToday: number
  photoPending: number
  qualityWaiting: number
  reportPending: number
  peopleToday: number
}

export function useDashboardSummary() {
  return useQuery({
    queryKey: ['dashboard-summary'],
    queryFn: () => api<DashboardSummary>('/dashboard/summary'),
  })
}
