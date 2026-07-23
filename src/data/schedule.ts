// 工程管理ガントの表示設定（カレンダー範囲・祝日）。
// 工程データ自体は API（PostgreSQL）から取得する。

// 工程管理のガント表示範囲
export const ganttRange = {
  start: '2026-06-01',
  end: '2026-08-12',
  today: '2026-07-21',
}

// 祝日（表示範囲内・カレンダー装飾用）
export const holidays: string[] = ['2026-07-20'] // 海の日
