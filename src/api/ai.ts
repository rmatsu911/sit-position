/**
 * AI機能の状態。
 *
 * 「何をする機能か」（構想）と「いま実際にどうなっているか」（状態）を分けて扱う。
 * 状態は必ず API が実データ（ai_models / ai_analysis_jobs）から判定した値を使い、
 * 画面側で「実装済み」「接続済み」と決め打ちしない。
 */
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/apiClient'

export type AiFeatureStatus =
  | 'connected'        // 実装・学習済みモデル・成功した推論がそろっている
  | 'processing'       // 処理中のジョブがある
  | 'failed'           // 直近のジョブが失敗している
  | 'service_down'     // モデルはあるが推論が動いていない
  | 'model_missing'    // 実装はあるが学習済みモデルが無い
  | 'not_implemented'  // 機能そのものが未実装

export interface AiFeatureState {
  key: string
  title: string
  status: AiFeatureStatus
  detail: string | null
  note: string
  job_type: string | null
}

export interface AiModelState {
  id: number
  name: string
  model_type: string
  version: string
  status: string
  trained_at: string | null
  trained: boolean
}

export interface AiStatusResponse {
  features: AiFeatureState[]
  models: AiModelState[]
  trained_model_count: number
  pending_jobs: number
  last_successful_job_at: string | null
}

/** 状態の表示名。画面ごとに言い換えないよう1か所に置く。 */
export const AI_STATUS_LABEL: Record<AiFeatureStatus, string> = {
  connected: '実装済み・接続済み',
  processing: '処理中',
  failed: '失敗',
  service_down: 'サービス未接続',
  model_missing: 'モデル未配置',
  not_implemented: '未実装',
}

/** 状態の色調。良い/悪い/中立の3段階だけにする。 */
export const AI_STATUS_TONE: Record<AiFeatureStatus, 'ok' | 'ng' | 'muted'> = {
  connected: 'ok',
  processing: 'muted',
  failed: 'ng',
  service_down: 'ng',
  model_missing: 'ng',
  not_implemented: 'muted',
}

export function useAiStatus(enabled = true) {
  return useQuery({
    queryKey: ['ai-status'],
    queryFn: () => api<AiStatusResponse>('/ai/status'),
    enabled,
    retry: false,
  })
}
