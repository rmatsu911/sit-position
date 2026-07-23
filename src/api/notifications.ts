import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/apiClient'
import type { Notification, NotifyKind } from '../types'

// バックエンド NotificationOut に対応
export interface ApiNotification {
  id: number
  kind: string
  title: string
  body: string | null
  project: string | null
  at: string | null
  read: boolean
  important: boolean
  link: string | null
}

function fmt(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

export function toNotification(n: ApiNotification): Notification {
  return {
    id: String(n.id),
    kind: n.kind as NotifyKind,
    title: n.title,
    body: n.body ?? '',
    project: n.project ?? '—',
    at: fmt(n.at),
    read: n.read,
    important: n.important,
    link: n.link ?? '/dashboard',
  }
}

export function useNotifications() {
  return useQuery({
    queryKey: ['notifications'],
    queryFn: async () => (await api<ApiNotification[]>('/notifications')).map(toNotification),
  })
}

export function useMarkNotificationRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { id: string | number; read?: boolean }) =>
      api<ApiNotification>(`/notifications/${input.id}/read?read=${input.read ?? true}`, { method: 'PATCH' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  })
}

export function useMarkAllNotificationsRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api<{ updated: number }>('/notifications/read-all', { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  })
}
