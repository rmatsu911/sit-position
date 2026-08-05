/**
 * 操作履歴（監査ログ）。
 *
 * 表示文はサーバー側で組み立てる。画面は固定の履歴文言を持たない。
 */
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/apiClient'

export interface AuditEntry {
  at: string | null
  user: string
  summary: string
  /** audit_log = 監査ログ / task_change = 工程の変更履歴 */
  source: 'audit_log' | 'task_change'
  entity_type: string
  entity_id: string | null
}

export interface AuditLogResponse {
  entries: AuditEntry[]
  returned: number
  limit: number
}

export function useProjectAuditLogs(projectId: number | undefined, limit = 50) {
  return useQuery({
    queryKey: ['audit-logs', projectId, limit],
    enabled: !!projectId,
    queryFn: () => api<AuditLogResponse>(`/projects/${projectId}/audit-logs?limit=${limit}`),
  })
}
