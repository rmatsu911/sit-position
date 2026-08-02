import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/apiClient'

// バックエンド SiteOut に対応
export interface ApiSite {
  id: number
  project_id: number
  name: string
  address: string | null
  description: string | null
}

export function useSites(projectId: number | undefined) {
  return useQuery({
    queryKey: ['sites', projectId],
    enabled: !!projectId,
    queryFn: () => api<ApiSite[]>(`/sites?project_id=${projectId}`),
  })
}

// バックエンド AssetOut に対応
export interface ApiAsset {
  id: number
  project_id: number
  site_id: number | null
  asset_type_id: number | null
  asset_code: string | null
  name: string
  manufacturer: string | null
  model_number: string | null
  status: string | null
}

// Site→Asset 連動：site_id 指定でその現場の設備のみ取得
export function useAssets(projectId: number | undefined, siteId: number | undefined) {
  return useQuery({
    queryKey: ['assets', projectId, siteId ?? null],
    enabled: !!projectId,
    queryFn: () => {
      const qs = new URLSearchParams({ project_id: String(projectId) })
      if (siteId) qs.set('site_id', String(siteId))
      return api<ApiAsset[]>(`/assets?${qs.toString()}`)
    },
  })
}
