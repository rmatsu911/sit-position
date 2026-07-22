// 画像認識・分類の「イメージ」を見せるための固定サンプルデータ。
// 実際の画像認識・推論は一切行わない（すべて検証用の固定値）。
import type { Photo } from '../types'

export interface Classification {
  分類候補: string
  工種候補: string
  工程候補: string
  設備候補: string
  現場候補: string
}

const table: Record<string, Omit<Classification, '現場候補'>> = {
  光ケーブル: { 分類候補: '光ケーブル', 工種候補: '光設備工事', 工程候補: '光ケーブル敷設', 設備候補: '架空光ケーブル' },
  クロージャ: { 分類候補: 'クロージャ', 工種候補: '光設備工事', 工程候補: 'クロージャ設置', 設備候補: '光接続クロージャ' },
  電柱: { 分類候補: '電柱・架空', 工種候補: '架空設備工事', 工程候補: '架空ケーブル敷設', 設備候補: '電柱・架空ケーブル' },
  ONU: { 分類候補: 'ONU', 工種候補: '宅内工事', 工程候補: 'ONU設置', 設備候補: '回線終端装置(ONU)' },
  光成端箱: { 分類候補: '光成端箱', 工種候補: '光設備工事', 工程候補: '光成端', 設備候補: '光成端箱' },
  スプライス: { 分類候補: 'スプライス', 工種候補: '光設備工事', 工程候補: '光ファイバ融着', 設備候補: '融着接続部' },
  融着: { 分類候補: '融着接続', 工種候補: '光設備工事', 工程候補: '光ファイバ融着', 設備候補: '融着接続機' },
  ハンドホール: { 分類候補: 'ハンドホール', 工種候補: '地中設備工事', 工程候補: '地中管路敷設', 設備候補: 'ハンドホール' },
  高所作業車: { 分類候補: '高所作業車', 工種候補: '安全・仮設', 工程候補: '高所作業車配置', 設備候補: '高所作業車' },
  接続試験: { 分類候補: '接続試験', 工種候補: '試験・測定', 工程候補: '接続損失測定', 設備候補: 'OTDR/光パワーメータ' },
  配線: { 分類候補: '局内配線', 工種候補: '局内工事', 工程候補: '局内配線', 設備候補: '通信ラック配線' },
  完成状態: { 分類候補: '完成状態', 工種候補: '完成検査', 工程候補: '完成確認', 設備候補: '完成状態' },
}

const projectName: Record<string, string> = {
  p1: '熊本中央局 光設備更改工事',
  p3: '菊陽町 通信管路敷設工事',
  p5: '玉名局 クロージャ更新工事',
}

export function classificationFor(photo: Photo): Classification {
  const base = table[photo.equipment] ?? { 分類候補: photo.equipment, 工種候補: '光設備工事', 工程候補: photo.process, 設備候補: photo.equipment }
  return { ...base, 現場候補: projectName[photo.projectId] ?? '熊本中央局 光設備更改工事' }
}

// 画像認識イメージ（参考表示）の枠。座標は 100×75 のビュー基準。
export interface RecogBox {
  no: number
  label: string
  kind: 'cable' | 'closure' | 'check'
  x: number
  y: number
  w: number
  h: number
}

export const boxColor: Record<RecogBox['kind'], string> = {
  cable: '#1d6fbd', // 青：光ケーブル系
  closure: '#2e8b57', // 緑：クロージャ系
  check: '#d64545', // 赤：確認候補
}

const secondaryLabel: Record<string, string> = {
  光ケーブル: 'クロージャ',
  クロージャ: '固定金具',
  電柱: '架空ケーブル',
  ONU: '光コード',
  光成端箱: 'パッチ配線',
  融着: '融着点',
  スプライス: '融着点',
  ハンドホール: '管路口',
  高所作業車: '電柱',
  接続試験: '測定端子',
  配線: 'ラック',
  完成状態: 'クロージャ',
}

// 各写真の「画像分類候補」枠（① 主設備=青, ② 関連=緑, ③ 確認候補=赤）
export function recogBoxesFor(photo: Photo): RecogBox[] {
  const primary = classificationFor(photo).分類候補
  return [
    { no: 1, label: primary, kind: 'cable', x: 12, y: 24, w: 36, h: 26 },
    { no: 2, label: secondaryLabel[photo.equipment] ?? '関連設備', kind: 'closure', x: 55, y: 20, w: 28, h: 24 },
    { no: 3, label: '確認候補', kind: 'check', x: 38, y: 52, w: 28, h: 18 },
  ]
}

// 画像分類候補（信頼度ではなく順位付きの候補として表示）
export function classCandidatesFor(photo: Photo): string[] {
  const primary = classificationFor(photo).分類候補
  const others = ['クロージャ', '電柱', '光成端箱', 'ONU'].filter((x) => x !== primary)
  return [primary, others[0], others[1]]
}

// 確認候補（工種・段階・タグ・完成状態など）
export const confirmCandidates = [
  '写真の工種確認',
  '施工段階の確認',
  '設備タグの確認',
  '完成状態の確認',
]

export const previewNote = '表示は検証用データに基づく参考表示です。'
export const classifyNote = '現在の分類候補は検証用データです。実際の画像認識は行っていません。'
