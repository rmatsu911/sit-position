import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/apiClient'
import type { LedgerRow } from '../types'

// バックエンド LedgerRowOut に対応（フロント LedgerRow とほぼ同形）
export interface ApiLedgerRow {
  id: number
  workNo: string
  contractNo: string | null
  name: string
  client: string | null
  category: string | null
  area: string | null
  contractAmount: number | null
  costPlan: number | null
  costActual: number | null
  profitRate: number | null
  startDate: string | null
  dueDate: string | null
  finishDate: string | null
  manager: string | null
  progress: number
  billing: string | null
  documents: string | null
  status: string
}

export function toLedgerRow(r: ApiLedgerRow): LedgerRow {
  return {
    id: String(r.id),
    workNo: r.workNo,
    contractNo: r.contractNo ?? '—',
    name: r.name,
    client: r.client ?? '—',
    category: r.category ?? '—',
    area: r.area ?? '—',
    contractAmount: r.contractAmount ?? 0,
    costPlan: r.costPlan ?? 0,
    costActual: r.costActual ?? 0,
    profitRate: r.profitRate ?? 0,
    startDate: r.startDate ?? '',
    dueDate: r.dueDate ?? '',
    finishDate: r.finishDate,
    manager: r.manager ?? '—',
    progress: r.progress,
    billing: r.billing ?? '—',
    documents: r.documents ?? '—',
    status: r.status as LedgerRow['status'],
  }
}

/** 工事台帳。案件を指定すると、その案件だけを取得する。 */
export function useLedger(projectId?: number) {
  return useQuery({
    queryKey: ['ledger', projectId ?? 'all'],
    queryFn: async () => {
      const qs = projectId ? `?project_id=${projectId}` : ''
      return (await api<ApiLedgerRow[]>(`/ledger${qs}`)).map(toLedgerRow)
    },
  })
}
