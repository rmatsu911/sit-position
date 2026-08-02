// AI画像認識・物体検出の表示に用いる型と描画用の定数。
// 実際の推論結果は API（ai_predictions 由来）から取得する。
// 固定のダミー推論を返す関数は本番化に伴い撤去した（Empty State で対応）。
import type { Photo } from '../types'

export interface Recognition {
  認識結果: string
  工種判定: string
  工程判定: string
  設備判定: string
  現場判定: string
}

// 物体検出結果（ラベル＋検出率）
export interface Detection {
  label: string
  pct: number
  kind: 'cable' | 'closure' | 'check'
}

export const boxColor: Record<Detection['kind'], string> = {
  cable: '#1d6fbd', // 青：光ケーブル系
  closure: '#2e8b57', // 緑：クロージャ系
  check: '#d64545', // 赤：確認対象
}

export interface RecogBox extends Detection {
  no: number
  x: number
  y: number
  w: number
  h: number
}

// 写真の品質ラベル（確認状況という実データから導出。AI推論ではない）
export function qualityJudgeFor(photo: Photo): string {
  return photo.confirm === '再撮影依頼' ? '要修正' : photo.confirm === '未確認' ? '要確認' : '良好'
}
