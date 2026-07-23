import { getToken } from '../lib/apiClient'

const BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://localhost:8000/api'

export interface ReportType {
  key: string
  label: string
}

// 帳票をダウンロード（認証付き fetch → Blob → 保存）。PostgreSQL→FastAPI→帳票→ブラウザDL。
export async function downloadReport(reportType: string, projectId: number, format: 'pdf' | 'xlsx'): Promise<void> {
  const token = getToken()
  const res = await fetch(`${BASE_URL}/reports/${reportType}?project_id=${projectId}&format=${format}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!res.ok) throw new Error(`帳票の生成に失敗しました (${res.status})`)
  const blob = await res.blob()
  const cd = res.headers.get('Content-Disposition') || ''
  const m = cd.match(/filename="?([^"]+)"?/)
  const filename = m ? m[1] : `${reportType}.${format}`
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
