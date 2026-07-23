import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/apiClient'
import type { Photo, PhotoConfirm } from '../types'
import type { Detection, RecogBox, Recognition } from '../data/aiPreview'

// このデモ画面が対象とする案件（熊本中央局 光設備更改工事）
export const DEMO_PROJECT_ID = 1

// バックエンド PhotoOut に対応
export interface ApiPhoto {
  id: number
  project_id: number
  site_id: number | null
  asset_id: number | null
  task_id: number | null
  photo_type_id: number | null
  no: string | null
  taken_at: string | null
  photographer: string | null
  place: string | null
  gps: string | null
  work_type: string | null
  process: string | null
  equipment: string | null
  tags: string[]
  comment: string | null
  confirm: string
  favorite: boolean
  ai_candidate: string | null
  original_url: string | null
  thumbnail_url: string | null
  uploaded: boolean
}

// バックエンド PhotoAiOut に対応
interface ApiPhotoAi {
  detections: { label: string; confidence: number; kind: string; bbox: number[] | null }[]
  recognition: Partial<Recognition>
  source: string
}

function fmtDate(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

// API の写真を既存フロント Photo 形式へ変換（UI互換のため colorKey は設備名を使う）
export function toPhoto(p: ApiPhoto): Photo {
  return {
    id: String(p.id),
    no: p.no ?? `P-${p.id}`,
    projectId: `p${p.project_id}`,
    takenAt: fmtDate(p.taken_at),
    photographer: p.photographer ?? '—',
    place: p.place ?? '—',
    gps: p.gps ?? '—',
    workType: p.work_type ?? '—',
    process: p.process ?? '—',
    equipment: p.equipment ?? '—',
    tags: p.tags ?? [],
    comment: p.comment ?? '',
    confirm: (p.confirm as PhotoConfirm) ?? '未確認',
    uploaded: p.uploaded,
    aiCandidate: p.ai_candidate ?? p.equipment ?? '—',
    favorite: p.favorite,
    colorKey: p.equipment ?? '光ケーブル',
  }
}

export function usePhotos(projectId: number = DEMO_PROJECT_ID) {
  return useQuery({
    queryKey: ['photos', projectId],
    queryFn: async () => (await api<ApiPhoto[]>(`/photos?project_id=${projectId}`)).map(toPhoto),
  })
}

// AI推論結果（ai_predictions 由来）を既存表示部品の形へ変換して返す。
// 将来 YOLO が ai_predictions に書けば、同じ経路で同じUIに反映される。
export interface PhotoAi {
  detections: Detection[]
  boxes: RecogBox[]
  recognition: Partial<Recognition>
  source: string
}

export function usePhotoAi(photoId: string | number | undefined) {
  return useQuery({
    queryKey: ['photo-ai', photoId],
    enabled: photoId !== undefined,
    queryFn: async (): Promise<PhotoAi> => {
      const r = await api<ApiPhotoAi>(`/photos/${photoId}/ai`)
      const detections: Detection[] = r.detections.map((d) => ({
        label: d.label,
        pct: Math.round((d.confidence ?? 0) * 100),
        kind: (d.kind as Detection['kind']) ?? 'check',
      }))
      const boxes: RecogBox[] = r.detections.map((d, i) => {
        const b = d.bbox ?? [12, 24, 36, 26]
        return {
          label: d.label,
          pct: Math.round((d.confidence ?? 0) * 100),
          kind: (d.kind as Detection['kind']) ?? 'check',
          no: i + 1,
          x: b[0], y: b[1], w: b[2], h: b[3],
        }
      })
      return { detections, boxes, recognition: r.recognition ?? {}, source: r.source }
    },
  })
}

export function useUploadPhoto(projectId: number = DEMO_PROJECT_ID) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { file: File; project_id?: number; site_id?: number; asset_id?: number; task_id?: number; photo_type_id?: number; place?: string; comment?: string }) => {
      const form = new FormData()
      form.set('project_id', String(input.project_id ?? projectId))
      form.set('file', input.file)
      if (input.site_id != null) form.set('site_id', String(input.site_id))
      if (input.asset_id != null) form.set('asset_id', String(input.asset_id))
      if (input.task_id != null) form.set('task_id', String(input.task_id))
      if (input.photo_type_id != null) form.set('photo_type_id', String(input.photo_type_id))
      if (input.place) form.set('place', input.place)
      if (input.comment) form.set('comment', input.comment)
      return api<ApiPhoto>('/photos', { method: 'POST', form })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['photos'] }),
  })
}

export function useUpdatePhoto() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { id: string | number; tags?: string[]; comment?: string; favorite?: boolean }) => {
      const { id, ...body } = input
      return api<ApiPhoto>(`/photos/${id}`, { method: 'PATCH', body })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['photos'] }),
  })
}

export function useConfirmPhoto() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { id: string | number; confirmation_status: PhotoConfirm }) =>
      api<ApiPhoto>(`/photos/${input.id}/confirm`, { method: 'PATCH', body: { confirmation_status: input.confirmation_status } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['photos'] }),
  })
}

export function useDeletePhoto() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { id: string | number; reason?: string }) =>
      api<void>(`/photos/${input.id}${input.reason ? `?reason=${encodeURIComponent(input.reason)}` : ''}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['photos'] }),
  })
}
