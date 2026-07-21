import type { Notification } from '../types'

export const notifications: Notification[] = [
  { id: 'n1', kind: '工程遅延', title: '接続損失測定が遅延しています', body: '熊本中央局 光設備更改工事の「接続損失測定」が予定より2日遅延しています。要員不足が原因です。', project: '熊本中央局 光設備更改工事', at: '2026/07/21 11:05', read: false, important: true, link: '/schedule' },
  { id: 'n2', kind: '写真未提出', title: '施工写真が未提出です', body: '接続損失測定の測定結果写真が未提出です（提出期限 7/23）。', project: '熊本中央局 光設備更改工事', at: '2026/07/21 11:00', read: false, important: true, link: '/photos' },
  { id: 'n3', kind: '再撮影依頼', title: 'ONU設置写真の再撮影依頼', body: '設備タグ未装着のため再撮影を依頼しました。', project: '熊本中央局 光設備更改工事', at: '2026/07/21 09:32', read: false, important: false, link: '/quality' },
  { id: 'n4', kind: '品質確認待ち', title: '品質確認待ちが7件あります', body: 'ケーブル余長・固定間隔ほか、確認待ち項目があります。', project: '熊本中央局 光設備更改工事', at: '2026/07/21 10:15', read: false, important: false, link: '/quality' },
  { id: 'n5', kind: '承認依頼', title: '現場日報の承認依頼', body: '7/20の日報が提出されました。確認・承認をお願いします。', project: '熊本中央局 光設備更改工事', at: '2026/07/21 08:20', read: true, important: false, link: '/daily-report' },
  { id: 'n6', kind: '資格期限接近', title: '高所作業車 特別教育の期限接近', body: '田中 一郎の資格更新期限が近づいています（残り30日）。', project: '—', at: '2026/07/21 07:50', read: true, important: false, link: '/personnel' },
  { id: 'n7', kind: '要員重複', title: '要員の重複配置の可能性', body: '鈴木 健が2案件に重複配置されています。調整してください。', project: '合志市 基地局設備更新工事', at: '2026/07/20 18:10', read: true, important: false, link: '/personnel' },
  { id: 'n8', kind: '図面更新', title: '切替手順図が差し戻されました', body: 'DWG-005 切替手順図が差し戻されました。修正が必要です。', project: '熊本中央局 光設備更改工事', at: '2026/07/21 08:06', read: false, important: false, link: '/drawings' },
  { id: 'n9', kind: '天候注意', title: '強風注意報', body: '本日午後、南の風やや強く 最大7m/s。高所作業に注意してください。', project: '—', at: '2026/07/21 06:30', read: true, important: false, link: '/dashboard' },
  { id: 'n10', kind: '熱中症注意', title: '熱中症 厳重警戒（WBGT 29）', body: '本日は熱中症指数が高い状態です。こまめな休憩・水分補給を徹底してください。', project: '—', at: '2026/07/21 06:00', read: true, important: false, link: '/dashboard' },
  { id: 'n11', kind: '日報未提出', title: '日報未提出があります', body: '天草地区 通信設備復旧工事の7/20日報が未提出です。', project: '天草地区 通信設備復旧工事', at: '2026/07/20 20:00', read: true, important: false, link: '/daily-report' },
  { id: 'n12', kind: '提出期限接近', title: '完成図書の提出期限接近', body: '玉名局 クロージャ更新工事の完成図書提出期限が近づいています。', project: '玉名局 クロージャ更新工事', at: '2026/07/20 15:00', read: true, important: false, link: '/reports' },
]
