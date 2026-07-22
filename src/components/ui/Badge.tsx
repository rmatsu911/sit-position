import type { ReactNode } from 'react'
import type { Tone } from '../../types'

const toneClass: Record<Tone, string> = {
  ok: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  warn: 'bg-amber-50 text-amber-700 border-amber-200',
  ng: 'bg-red-50 text-red-700 border-red-200',
  info: 'bg-sysken-50 text-sysken-700 border-sysken-200',
  muted: 'bg-slate-100 text-slate-600 border-slate-200',
}

// ステータス文字列 → トーン
const statusToneMap: Record<string, Tone> = {
  // 案件/工程
  未着工: 'muted',
  未着手: 'muted',
  準備中: 'info',
  施工中: 'info',
  確認待ち: 'warn',
  一時停止: 'warn',
  遅延: 'ng',
  完了: 'ok',
  中止: 'muted',
  // 品質
  合格: 'ok',
  注意: 'warn',
  不合格: 'ng',
  未判定: 'muted',
  情報不足: 'warn',
  未提出: 'ng',
  警告: 'warn',
  確認済み: 'ok',
  再撮影依頼: 'ng',
  承認済み: 'ok',
  // 日報
  下書き: 'muted',
  提出済み: 'info',
  確認中: 'warn',
  差し戻し: 'ng',
  // 要員
  稼働: 'ok',
  待機: 'info',
  休暇: 'muted',
  移動中: 'warn',
  // 写真
  未確認: 'warn',
}

export function statusTone(status: string): Tone {
  return statusToneMap[status] ?? 'muted'
}

export function Badge({
  children,
  tone = 'muted',
  dot = false,
}: {
  children: ReactNode
  tone?: Tone
  dot?: boolean
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[12.5px] font-medium ${toneClass[tone]}`}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  )
}

export function StatusBadge({ status }: { status: string }) {
  return <Badge tone={statusTone(status)}>{status}</Badge>
}
