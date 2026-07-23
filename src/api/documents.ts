import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/apiClient'
import type { Drawing } from '../types'

// バックエンド DocumentOut に対応
export interface ApiDocument {
  id: number
  project_id: number | null
  no: string
  name: string
  type: string | null
  rev: string | null
  updatedAt: string | null
  updatedBy: string | null
  approval: string
}

function fmt(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

export function toDrawing(d: ApiDocument): Drawing {
  return {
    id: String(d.id),
    no: d.no,
    name: d.name,
    type: d.type ?? '—',
    rev: d.rev ?? 'Rev.0',
    updatedAt: fmt(d.updatedAt),
    updatedBy: d.updatedBy ?? '—',
    approval: d.approval as Drawing['approval'],
  }
}

export function useDocuments(projectId?: number) {
  return useQuery({
    queryKey: ['documents', projectId ?? 'all'],
    queryFn: async () => {
      const qs = projectId ? `?project_id=${projectId}` : ''
      return (await api<ApiDocument[]>(`/documents${qs}`)).map(toDrawing)
    },
  })
}

export interface ApiDocumentDetail extends ApiDocument {
  versions: { id: number; rev: string; original_filename: string | null; note: string | null; updated_by: string | null; updated_at: string | null }[]
}

export function useDocument(id: string | number | undefined) {
  return useQuery({
    queryKey: ['document', id],
    enabled: id !== undefined,
    queryFn: () => api<ApiDocumentDetail>(`/documents/${id}`),
  })
}

// 新規図面 or 既存図面の新しい版をアップロード
export function useUploadDocument() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { file: File; document_id?: number; project_id?: number; doc_no?: string; name?: string; doc_type?: string; note?: string }) => {
      const form = new FormData()
      form.set('file', input.file)
      if (input.document_id != null) form.set('document_id', String(input.document_id))
      if (input.project_id != null) form.set('project_id', String(input.project_id))
      if (input.doc_no) form.set('doc_no', input.doc_no)
      if (input.name) form.set('name', input.name)
      if (input.doc_type) form.set('doc_type', input.doc_type)
      if (input.note) form.set('note', input.note)
      return api<ApiDocumentDetail>('/documents', { method: 'POST', form })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['documents'] }),
  })
}

export function useUpdateDocument() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { id: string | number; name?: string; doc_type?: string; status?: string }) => {
      const { id, ...body } = input
      return api<ApiDocument>(`/documents/${id}`, { method: 'PATCH', body })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['documents'] }),
  })
}

export function useDeleteDocument() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { id: string | number; reason?: string }) =>
      api<void>(`/documents/${input.id}${input.reason ? `?reason=${encodeURIComponent(input.reason)}` : ''}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['documents'] }),
  })
}
