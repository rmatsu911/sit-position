import { useQuery } from '@tanstack/react-query'
import { api, getToken } from '../lib/apiClient'

const BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://localhost:8000/api'

export interface ReportType {
  key: string
  label: string
}

/**
 * 認証付きでファイルを取得して保存する（fetch → Blob → ダウンロード）。
 * 帳票・横断工程表の出力など、Response をそのまま返すAPIで共用する。
 */
export async function downloadFile(path: string, fallbackName: string): Promise<void> {
  const token = getToken()
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!res.ok) throw new Error(`ファイルの生成に失敗しました (${res.status})`)
  const blob = await res.blob()
  const cd = res.headers.get('Content-Disposition') || ''
  const m = cd.match(/filename="?([^"]+)"?/)
  const filename = m ? m[1] : fallbackName
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export type ReportFormat = 'pdf' | 'xlsx' | 'csv'

// 帳票をダウンロード。PostgreSQL→FastAPI→帳票→ブラウザDL。
export function downloadReport(reportType: string, projectId: number, format: ReportFormat): Promise<void> {
  return downloadFile(
    `/reports/${reportType}?project_id=${projectId}&format=${format}`,
    `${reportType}.${format}`,
  )
}

/**
 * 帳票の内容。PDF / Excel / CSV とまったく同じ内容をAPIから受け取る。
 * 画面側で行を作らないため、表示した工程がそのまま出力される。
 */
export interface ReportPreview {
  report_type: string
  title: string
  project_id: number
  construction_number: string
  project_name: string
  meta: { label: string; value: string }[]
  columns: string[]
  rows: string[][]
  row_count: number
  source: 'tasks' | 'manual'
  formats: ReportFormat[]
}

export function useReportPreview(reportType: string | undefined, projectId: number | undefined) {
  return useQuery({
    queryKey: ['report-preview', reportType ?? null, projectId ?? null],
    queryFn: () => api<ReportPreview>(`/reports/${reportType}/preview?project_id=${projectId}`),
    enabled: !!reportType && !!projectId,
  })
}
