import { useMemo, useState } from 'react'
import { FileDown, FileSpreadsheet, Printer, Filter, Copy } from 'lucide-react'
import { PageHeader } from '../components/layout/Breadcrumb'
import { Panel } from '../components/ui/common'
import { Modal } from '../components/ui/Modal'
import { StatusBadge } from '../components/ui/Badge'
import { useApp } from '../context/AppContext'
import { useLedger } from '../api/ledger'
import { yen } from '../lib/format'

const COLS = [
  { key: 'workNo', label: '工事番号', w: 110, num: false },
  { key: 'contractNo', label: '契約番号', w: 110, num: false },
  { key: 'name', label: '工事名', w: 220, num: false },
  { key: 'client', label: '顧客', w: 150, num: false },
  { key: 'category', label: '工事区分', w: 120, num: false },
  { key: 'area', label: 'エリア', w: 110, num: false },
  { key: 'contractAmount', label: '契約金額', w: 120, num: true },
  { key: 'costPlan', label: '原価予定', w: 120, num: true },
  { key: 'costActual', label: '原価実績', w: 120, num: true },
  { key: 'profitRate', label: '利益率', w: 72, num: true },
  { key: 'startDate', label: '着工日', w: 100, num: false },
  { key: 'dueDate', label: '完成予定日', w: 100, num: false },
  { key: 'finishDate', label: '完成日', w: 90, num: false },
  { key: 'manager', label: '責任者', w: 90, num: false },
  { key: 'progress', label: '進捗', w: 60, num: true },
  { key: 'billing', label: '請求状況', w: 80, num: false },
  { key: 'documents', label: '書類状況', w: 80, num: false },
  { key: 'status', label: 'ステータス', w: 90, num: false },
] as const

export default function Ledger() {
  const { toast } = useApp()
  const { data: ledgerRows = [], isLoading, isError } = useLedger()
  const [selectedCell, setSelectedCell] = useState<string | null>(null)
  const [selectedRow, setSelectedRow] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<string>('workNo')
  const [asc, setAsc] = useState(true)
  const [output, setOutput] = useState<string | null>(null)

  const rows = useMemo(() => {
    const r = [...ledgerRows]
    r.sort((a, b) => {
      const av = (a as never)[sortKey]
      const bv = (b as never)[sortKey]
      const c = typeof av === 'number' ? av - (bv as number) : String(av).localeCompare(String(bv))
      return asc ? c : -c
    })
    return r
  }, [ledgerRows, sortKey, asc])

  const total = {
    contract: ledgerRows.reduce((s, r) => s + r.contractAmount, 0),
    costPlan: ledgerRows.reduce((s, r) => s + r.costPlan, 0),
    costActual: ledgerRows.reduce((s, r) => s + r.costActual, 0),
  }

  function sortBy(key: string) {
    if (sortKey === key) setAsc((v) => !v)
    else { setSortKey(key); setAsc(true) }
  }

  function fmt(key: string, val: unknown): string {
    if (val === null || val === undefined) return '—'
    if (key === 'profitRate') return `${val}%`
    if (key === 'progress') return `${val}%`
    if (['contractAmount', 'costPlan', 'costActual'].includes(key)) return yen(val as number)
    if (['startDate', 'dueDate', 'finishDate'].includes(key)) return String(val).slice(2)
    return String(val)
  }

  return (
    <div>
      <PageHeader
        breadcrumb={[{ label: '工事台帳' }]}
        title="工事台帳"
        description="工事情報の一覧管理（Excel風）"
        actions={
          <>
            <button className="btn-default" onClick={() => toast('この操作は現在準備中です')}><Filter size={15} />列固定</button>
            <button className="btn-default" onClick={() => toast('この操作は現在準備中です')}><Copy size={15} />コピー</button>
            <button className="btn-default" onClick={() => setOutput('工事台帳のCSV出力')}><FileDown size={15} />CSV出力</button>
            <button className="btn-default" onClick={() => setOutput('工事台帳のExcel出力')}><FileSpreadsheet size={15} />Excel出力</button>
            <button className="btn-default" onClick={() => toast('この操作は現在準備中です')}><Printer size={15} />印刷</button>
          </>
        }
      />

      {isLoading && <div className="mb-3 rounded border border-line bg-white px-4 py-8 text-center text-[13px] text-ink-soft">工事台帳を読み込んでいます…</div>}
      {isError && <div className="mb-3 rounded border border-red-200 bg-red-50 px-4 py-6 text-center text-[13px] text-ng">工事台帳の取得に失敗しました。</div>}

      <Panel bodyClassName="p-0" className="overflow-hidden">
        <div className="thin-scroll overflow-auto" style={{ maxHeight: 'calc(100vh - 250px)' }}>
          <table className="text-[12px]" style={{ borderCollapse: 'separate', borderSpacing: 0 }}>
            <thead className="sticky top-0 z-20">
              <tr>
                <th className="sticky left-0 z-30 border-b border-r border-line bg-slate-100 px-2 py-1.5 text-ink-soft" style={{ width: 40 }}>#</th>
                {COLS.map((c, i) => (
                  <th key={c.key} onClick={() => sortBy(c.key)}
                    className={`cursor-pointer border-b border-r border-line bg-slate-100 px-2 py-1.5 text-left font-semibold text-ink hover:bg-slate-200 ${i === 0 ? 'sticky z-20' : ''}`}
                    style={{ width: c.w, minWidth: c.w, left: i === 0 ? 40 : undefined }}>
                    {c.label}{sortKey === c.key && (asc ? ' ▲' : ' ▼')}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={r.id} className={selectedRow === r.id ? 'bg-sysken-50' : ri % 2 ? 'bg-white' : 'bg-slate-50/40'}>
                  <td className="sticky left-0 z-10 cursor-pointer border-b border-r border-line bg-slate-100 px-2 py-1 text-center text-ink-soft" style={{ width: 40 }} onClick={() => setSelectedRow(r.id)}>{ri + 1}</td>
                  {COLS.map((c, ci) => {
                    const cid = `${r.id}-${c.key}`
                    const val = fmt(c.key, (r as never)[c.key])
                    return (
                      <td key={c.key}
                        onClick={() => { setSelectedCell(cid); setSelectedRow(r.id) }}
                        className={`border-b border-r border-line px-2 py-1 ${c.num ? 'text-right tabular-nums' : ''} ${ci === 0 ? 'sticky z-10 font-medium' : ''} ${selectedCell === cid ? 'outline outline-2 -outline-offset-2 outline-sysken-500' : ''} ${c.key === 'status' ? '' : ''} ${(c.key === 'costActual' && r.costActual > r.costPlan) ? 'text-ng' : ''}`}
                        style={{ left: ci === 0 ? 40 : undefined, background: ci === 0 ? (selectedRow === r.id ? '#e9f2fa' : '#fff') : undefined }}>
                        {c.key === 'status' ? <StatusBadge status={r.status} /> : val}
                      </td>
                    )
                  })}
                </tr>
              ))}
              {/* 合計行 */}
              <tr className="sticky bottom-0 bg-sysken-50 font-semibold">
                <td className="sticky left-0 z-10 border-t border-r border-line bg-sysken-100 px-2 py-1.5" style={{ width: 40 }}></td>
                <td className="sticky z-10 border-t border-r border-line bg-sysken-100 px-2 py-1.5" style={{ left: 40 }}>合計</td>
                <td className="border-t border-r border-line px-2" colSpan={5}></td>
                <td className="border-t border-r border-line px-2 py-1.5 text-right tabular-nums">{yen(total.contract)}</td>
                <td className="border-t border-r border-line px-2 py-1.5 text-right tabular-nums">{yen(total.costPlan)}</td>
                <td className="border-t border-r border-line px-2 py-1.5 text-right tabular-nums">{yen(total.costActual)}</td>
                <td className="border-t border-r border-line px-2" colSpan={9}></td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-line px-3 py-1.5 text-xs text-ink-soft">
          <span>{ledgerRows.length}件 ／ セルをクリックで選択・列見出しクリックで並び替え</span>
          {selectedCell && <span>選択セル：{selectedCell}</span>}
        </div>
      </Panel>

      {/* 未対応の出力。生成中の演出は出さず、未対応であることをそのまま伝える */}
      <Modal open={!!output} onClose={() => setOutput(null)} title="この出力は未対応です"
        footer={<button className="btn-primary" onClick={() => setOutput(null)}>閉じる</button>}>
        <div className="space-y-2 px-1 py-2 text-[13px] text-ink">
          <p>{output} は、まだ実ファイルを生成できません。</p>
          <p className="text-ink-soft">
            実ファイルを生成できる帳票は「報告書」画面の施工管理表（PDF ／ Excel）です。
          </p>
        </div>
      </Modal>
    </div>
  )
}
