import type { Photo } from '../types'

// 設備種別ごとの色（プレースホルダ画像用）
export const equipColor: Record<string, string> = {
  光ケーブル: '#005bac',
  クロージャ: '#2e8b57',
  電柱: '#8a6d3b',
  ONU: '#7b3fa0',
  光成端箱: '#0b7a86',
  スプライス: '#c2410c',
  融着: '#b91c1c',
  ハンドホール: '#4b5563',
  高所作業車: '#e6a700',
  接続試験: '#164a7b',
  配線: '#0369a1',
  完成状態: '#2e8b57',
}

const photographers = ['山田 太郎', '田中 一郎', '高橋 誠', '鈴木 健', '伊藤 直樹']
const processes = ['光ケーブル敷設', 'クロージャ設置', '光ファイバ融着', '接続損失測定', 'ONU設置', '既設設備確認']
const equipments = Object.keys(equipColor)

function pad(n: number): string {
  return n.toString().padStart(3, '0')
}

const seedTags: Record<string, string[]> = {
  光ケーブル: ['光ケーブル', '架空ケーブル', '敷設'],
  クロージャ: ['クロージャ', '接続', '完成状態'],
  電柱: ['電柱', '架空ケーブル'],
  ONU: ['ONU', '宅内工事'],
  光成端箱: ['光成端箱', '配線'],
  スプライス: ['スプライス', '融着'],
  融着: ['融着', '接続試験'],
  ハンドホール: ['ハンドホール', '地中管路'],
  高所作業車: ['高所作業車', '安全'],
  接続試験: ['接続試験', '通信試験'],
  配線: ['配線', 'MDF'],
  完成状態: ['完成状態', '検査'],
}

export const photos: Photo[] = Array.from({ length: 27 }).map((_, i) => {
  const equip = equipments[i % equipments.length]
  const proc = processes[i % processes.length]
  const day = 6 + (i % 16)
  const hh = 8 + (i % 9)
  const mm = (i * 7) % 60
  const confirm = i % 5 === 0 ? '未確認' : i % 7 === 0 ? '再撮影依頼' : '確認済み'
  return {
    id: `ph${i + 1}`,
    no: `P-${pad(i + 1)}`,
    projectId: 'p1',
    takenAt: `2026/07/${day.toString().padStart(2, '0')} ${hh.toString().padStart(2, '0')}:${mm.toString().padStart(2, '0')}`,
    photographer: photographers[i % photographers.length],
    place: ['局舎1F MDF室', '局前 電柱No.12', '幹線 ハンドホールH-3', '宅内 A棟', '屋上 ケーブルラック'][i % 5],
    gps: `32.79${pad((i * 13) % 999)}, 130.74${pad((i * 17) % 999)}`,
    workType: ['敷設', '接続', '試験', '宅内', '調査'][i % 5],
    process: proc,
    equipment: equip,
    tags: seedTags[equip] ?? [equip],
    comment: i % 4 === 0 ? '固定金具の取付状態を確認。良好。' : '',
    confirm: confirm as Photo['confirm'],
    uploaded: true,
    aiCandidate: equip,
    favorite: i % 6 === 0,
    colorKey: equip,
  }
})

export const photoTags = [
  '光ケーブル', 'クロージャ', '電柱', 'ONU', '光成端箱', 'スプライス',
  '融着', 'ハンドホール', 'MDF', 'IDF', 'ラック', '高所作業車',
  '配線', '接続試験', '完成状態',
]
