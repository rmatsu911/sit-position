import { useState } from 'react'
import { PlayCircle, X, ListChecks } from 'lucide-react'

const steps = [
  'ダッシュボードで全案件の状況を確認',
  '遅延案件を選択',
  '工程管理で予定と実績を比較',
  '工程バーをドラッグして日程を変更',
  '施工写真で設備タグを検索',
  '品質管理で施工中写真と完成見本を比較',
  '再撮影依頼または承認を実行',
  '現場日報を提出',
  '報告書をPDF出力したように見せる',
  'AIパネルを開き、将来実装予定の機能を説明',
]

// 発表者向けのデモ操作ガイド（ヘッダーから開くドロワー）
export function DemoGuide() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded border border-sysken-200 bg-sysken-50 px-2.5 py-1.5 text-[12.5px] font-medium text-sysken-700 hover:bg-sysken-100"
        title="発表者向けデモ操作ガイド"
      >
        <PlayCircle size={16} />
        デモガイド
      </button>

      {open && (
        <div className="fixed inset-0 z-[60] flex justify-end">
          <div className="absolute inset-0 bg-ink/30" onClick={() => setOpen(false)} />
          <div className="relative z-10 flex h-full w-[380px] flex-col bg-white shadow-pop">
            <header className="flex items-center justify-between border-b border-line bg-canvas px-4 py-3">
              <div className="flex items-center gap-2">
                <ListChecks size={18} className="text-sysken-600" />
                <span className="text-[15px] font-semibold text-ink">デモ操作ガイド</span>
              </div>
              <button onClick={() => setOpen(false)} className="rounded p-1 text-ink-soft hover:bg-line/60"><X size={18} /></button>
            </header>
            <div className="thin-scroll flex-1 overflow-y-auto p-4">
              <p className="mb-3 text-[12.5px] text-ink-soft">発表者向けの推奨操作順です（このガイドは発表者のみ確認できます）。</p>
              <ol className="space-y-2.5">
                {steps.map((s, i) => (
                  <li key={i} className="flex items-start gap-2.5">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sysken-500 text-[12px] font-bold text-white">{i + 1}</span>
                    <span className="pt-0.5 text-[13.5px] text-ink">{s}</span>
                  </li>
                ))}
              </ol>
            </div>
            <div className="border-t border-line bg-canvas px-4 py-3 text-[12px] text-ink-soft">
              この一連の操作で、案件状況→工程→写真→品質→日報→報告までの流れが伝わります。
            </div>
          </div>
        </div>
      )}
    </>
  )
}
