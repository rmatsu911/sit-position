import type { Worker } from '../types'

const S = (a: Worker['status'][]) => a

export const workers: Worker[] = [
  { id: 'w1', name: '山田 太郎', org: '施工管理部 第一課', crew: '第一班', role: '工事長', licenses: ['職長・安全衛生責任者', '光ファイバ融着', '普通自動車免許'], assignedTo: '熊本中央局 光設備更改工事', schedule: S(['稼働', '稼働', '稼働', '稼働', '稼働', '休暇', '休暇']), status: '稼働', continuousDays: 5, vacation: '—', note: '現場責任者' },
  { id: 'w2', name: '田中 一郎', org: '施工管理部 第一課', crew: '第一班', role: '現場責任者', licenses: ['高所作業車', '玉掛け', '小型移動式クレーン', '普通自動車免許'], assignedTo: '菊陽町 通信管路敷設工事', schedule: S(['稼働', '稼働', '稼働', '稼働', '稼働', '稼働', '休暇']), status: '稼働', continuousDays: 6, vacation: '—', note: '連続勤務注意' },
  { id: 'w3', name: '高橋 誠', org: '施工管理部 第二課', crew: '第二班', role: '技術者', licenses: ['光ファイバ融着', '低圧電気取扱', 'フルハーネス特別教育'], assignedTo: '熊本中央局 光設備更改工事', schedule: S(['稼働', '稼働', '稼働', '稼働', '稼働', '待機', '休暇']), status: '稼働', continuousDays: 5, vacation: '—', note: '融着・測定担当' },
  { id: 'w4', name: '鈴木 健', org: '施工管理部 第三課', crew: '第三班', role: '技術者', licenses: ['電気工事士', 'フルハーネス特別教育', '普通自動車免許'], assignedTo: '合志市 基地局設備更新工事', schedule: S(['稼働', '稼働', '移動中', '稼働', '稼働', '休暇', '休暇']), status: '移動中', continuousDays: 3, vacation: '—', note: '2現場を兼務' },
  { id: 'w5', name: '佐藤 花子', org: '施工管理部 第二課', crew: '第二班', role: '現場責任者', licenses: ['職長・安全衛生責任者', '光ファイバ融着', '普通自動車免許'], assignedTo: '八代エリア FTTH増設工事', schedule: S(['稼働', '稼働', '稼働', '稼働', '稼働', '休暇', '休暇']), status: '稼働', continuousDays: 5, vacation: '—', note: '' },
  { id: 'w6', name: '伊藤 直樹', org: '施工管理部 第一課', crew: '第一班', role: '技術者', licenses: ['高所作業車', '玉掛け', '低圧電気取扱'], assignedTo: '熊本市東区 光ケーブル切替工事', schedule: S(['稼働', '稼働', '稼働', '稼働', '稼働', '待機', '休暇']), status: '稼働', continuousDays: 4, vacation: '—', note: '切替作業担当' },
  { id: 'w7', name: '渡辺 修', org: '施工管理部 第三課', crew: '第三班', role: '現場責任者', licenses: ['職長・安全衛生責任者', '酸素欠乏危険作業', '普通自動車免許'], assignedTo: '天草地区 通信設備復旧工事', schedule: S(['稼働', '稼働', '稼働', '稼働', '稼働', '稼働', '待機']), status: '稼働', continuousDays: 7, vacation: '要調整', note: '連続7日 過剰勤務警告' },
  { id: 'w8', name: '中村 亮', org: '施工管理部 第二課', crew: '第二班', role: '技術者', licenses: ['高所作業車', 'フルハーネス特別教育', '普通自動車免許'], assignedTo: '待機', schedule: S(['待機', '待機', '稼働', '稼働', '稼働', '休暇', '休暇']), status: '待機', continuousDays: 0, vacation: '—', note: '配置可能' },
  { id: 'w9', name: '小林 大輔', org: '協力会社 九州テクノ', crew: '応援', role: '作業員', licenses: ['光ファイバ融着', '玉掛け'], assignedTo: '待機', schedule: S(['待機', '稼働', '稼働', '稼働', '稼働', '休暇', '休暇']), status: '待機', continuousDays: 0, vacation: '—', note: '融着応援可' },
  { id: 'w10', name: '加藤 隆', org: '協力会社 肥後設備', crew: '応援', role: '作業員', licenses: ['高所作業車', '交通誘導'], assignedTo: '菊陽町 通信管路敷設工事', schedule: S(['稼働', '稼働', '稼働', '待機', '稼働', '休暇', '休暇']), status: '稼働', continuousDays: 3, vacation: '—', note: '' },
  { id: 'w11', name: '吉田 昇', org: '施工管理部 第一課', crew: '第一班', role: '作業員', licenses: ['玉掛け', '普通自動車免許'], assignedTo: '熊本中央局 光設備更改工事', schedule: S(['稼働', '稼働', '稼働', '稼働', '稼働', '休暇', '休暇']), status: '稼働', continuousDays: 5, vacation: '—', note: '' },
  { id: 'w12', name: '松本 康', org: '施工管理部 第三課', crew: '第三班', role: '作業員', licenses: ['酸素欠乏危険作業', '普通自動車免許'], assignedTo: '休暇', schedule: S(['休暇', '休暇', '稼働', '稼働', '稼働', '稼働', '休暇']), status: '休暇', continuousDays: 0, vacation: '7/21-7/22', note: '有給休暇' },
]

export const scheduleDates = ['7/21(月)', '7/22(火)', '7/23(水)', '7/24(木)', '7/25(金)', '7/26(土)', '7/27(日)']
