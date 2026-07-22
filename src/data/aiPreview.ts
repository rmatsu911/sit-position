// AI施工写真分類・AI画像認識の結果表示に用いる固定データ。
// （画面はAI実装後の完成イメージ。実際のAI処理は未実装で、値はすべて固定。）
import type { Photo } from '../types'

export interface Recognition {
  認識結果: string
  工種判定: string
  工程判定: string
  設備判定: string
  現場判定: string
}

const table: Record<string, Omit<Recognition, '現場判定'>> = {
  光ケーブル: { 認識結果: '光ケーブル', 工種判定: '光設備工事', 工程判定: '光ケーブル敷設', 設備判定: '架空光ケーブル' },
  クロージャ: { 認識結果: 'クロージャ', 工種判定: '光設備工事', 工程判定: 'クロージャ設置', 設備判定: '光接続クロージャ' },
  電柱: { 認識結果: '電柱・架空', 工種判定: '架空設備工事', 工程判定: '架空ケーブル敷設', 設備判定: '電柱・架空ケーブル' },
  ONU: { 認識結果: 'ONU', 工種判定: '宅内工事', 工程判定: 'ONU設置', 設備判定: '回線終端装置(ONU)' },
  光成端箱: { 認識結果: '光成端箱', 工種判定: '光設備工事', 工程判定: '光成端', 設備判定: '光成端箱' },
  スプライス: { 認識結果: 'スプライス', 工種判定: '光設備工事', 工程判定: '光ファイバ融着', 設備判定: '融着接続部' },
  融着: { 認識結果: '融着接続', 工種判定: '光設備工事', 工程判定: '光ファイバ融着', 設備判定: '融着接続機' },
  ハンドホール: { 認識結果: 'ハンドホール', 工種判定: '地中設備工事', 工程判定: '地中管路敷設', 設備判定: 'ハンドホール' },
  高所作業車: { 認識結果: '高所作業車', 工種判定: '安全・仮設', 工程判定: '高所作業車配置', 設備判定: '高所作業車' },
  接続試験: { 認識結果: '接続試験', 工種判定: '試験・測定', 工程判定: '接続損失測定', 設備判定: 'OTDR/光パワーメータ' },
  配線: { 認識結果: '局内配線', 工種判定: '局内工事', 工程判定: '局内配線', 設備判定: '通信ラック配線' },
  完成状態: { 認識結果: '完成状態', 工種判定: '完成検査', 工程判定: '完成確認', 設備判定: '完成状態' },
}

const projectName: Record<string, string> = {
  p1: '熊本中央局 光設備更改工事',
  p3: '菊陽町 通信管路敷設工事',
  p5: '玉名局 クロージャ更新工事',
}

export function recognitionFor(photo: Photo): Recognition {
  const base = table[photo.equipment] ?? { 認識結果: photo.equipment, 工種判定: '光設備工事', 工程判定: photo.process, 設備判定: photo.equipment }
  return { ...base, 現場判定: projectName[photo.projectId] ?? '熊本中央局 光設備更改工事' }
}

// 物体検出結果（ラベル＋検出率）
export interface Detection {
  label: string
  pct: number
  kind: 'cable' | 'closure' | 'check'
}

const detTable: Record<string, Detection[]> = {
  光ケーブル: [{ label: '光ケーブル', pct: 92, kind: 'cable' }, { label: 'クロージャ', pct: 84, kind: 'closure' }, { label: '電柱', pct: 61, kind: 'check' }],
  クロージャ: [{ label: 'クロージャ', pct: 90, kind: 'closure' }, { label: '光ケーブル', pct: 79, kind: 'cable' }, { label: '固定金具', pct: 58, kind: 'check' }],
  電柱: [{ label: '電柱', pct: 91, kind: 'cable' }, { label: '架空ケーブル', pct: 82, kind: 'closure' }, { label: '腕金', pct: 57, kind: 'check' }],
  ONU: [{ label: 'ONU', pct: 93, kind: 'cable' }, { label: '光コード', pct: 76, kind: 'closure' }, { label: 'ラベル', pct: 55, kind: 'check' }],
  光成端箱: [{ label: '光成端箱', pct: 89, kind: 'cable' }, { label: 'パッチ配線', pct: 80, kind: 'closure' }, { label: '成端トレイ', pct: 60, kind: 'check' }],
  融着: [{ label: '融着接続機', pct: 90, kind: 'cable' }, { label: '融着点', pct: 83, kind: 'closure' }, { label: '心線', pct: 59, kind: 'check' }],
  スプライス: [{ label: 'スプライス', pct: 88, kind: 'cable' }, { label: '融着点', pct: 81, kind: 'closure' }, { label: '心線', pct: 56, kind: 'check' }],
  ハンドホール: [{ label: 'ハンドホール', pct: 90, kind: 'cable' }, { label: '管路口', pct: 78, kind: 'closure' }, { label: 'ケーブル', pct: 62, kind: 'check' }],
  高所作業車: [{ label: '高所作業車', pct: 94, kind: 'cable' }, { label: '電柱', pct: 80, kind: 'closure' }, { label: 'バケット', pct: 64, kind: 'check' }],
  接続試験: [{ label: 'OTDR', pct: 88, kind: 'cable' }, { label: '測定端子', pct: 77, kind: 'closure' }, { label: '光コード', pct: 58, kind: 'check' }],
  配線: [{ label: '通信ラック', pct: 89, kind: 'cable' }, { label: '配線', pct: 82, kind: 'closure' }, { label: 'ラベル', pct: 57, kind: 'check' }],
  完成状態: [{ label: 'クロージャ', pct: 91, kind: 'cable' }, { label: '固定金具', pct: 80, kind: 'closure' }, { label: 'タグ', pct: 63, kind: 'check' }],
}

export function detectionsFor(photo: Photo): Detection[] {
  return detTable[photo.equipment] ?? [
    { label: recognitionFor(photo).認識結果, pct: 90, kind: 'cable' },
    { label: '関連設備', pct: 78, kind: 'closure' },
    { label: '確認対象', pct: 58, kind: 'check' },
  ]
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

const positions = [
  { x: 12, y: 24, w: 36, h: 26 },
  { x: 55, y: 20, w: 28, h: 24 },
  { x: 38, y: 52, w: 28, h: 18 },
]

// 物体検出枠（① 主設備=青, ② 関連=緑, ③ 確認対象=赤）
export function recogBoxesFor(photo: Photo): RecogBox[] {
  return detectionsFor(photo).map((d, i) => ({ ...d, no: i + 1, ...positions[i] }))
}

// 写真の品質判定（固定）
export function qualityJudgeFor(photo: Photo): string {
  return photo.confirm === '再撮影依頼' ? '要修正' : photo.confirm === '未確認' ? '要確認' : '良好'
}
