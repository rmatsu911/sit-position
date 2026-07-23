import { useState } from 'react'
import { FileSpreadsheet, FileDown, FileText, Printer, Plus, Trash2, Eye, Filter } from 'lucide-react'
import { PageHeader } from '../components/layout/Breadcrumb'
import { Panel } from '../components/ui/common'
import { Modal } from '../components/ui/Modal'
import { StepRunner } from '../components/ui/StepRunner'
import { useApp } from '../context/AppContext'
import { downloadReport } from '../api/reports'
import { DEMO_PROJECT_ID } from '../api/photos'

// バックエンドで実生成に対応した帳票（type表示名 → APIキー）
const REPORT_KEY: Record<string, string> = { 施工管理表: 'construction-management' }

const reportTypes = [
  '施工管理表', '工程進捗報告書', '施工写真台帳', '現場日報一覧',
  '品質確認報告書', '完成報告書', '要員実績表', '安全管理報告書',
]

type Row = { process: string; plan: string; actual: string; people: string; progress: string; note: string }
const initialRows: Row[] = [
  { process: '光ケーブル敷設', plan: '06/22-07/04', actual: '06/22-07/05', people: '26', progress: '100%', note: '余長確認済' },
  { process: 'クロージャ設置', plan: '07/06-07/11', actual: '07/07-07/11', people: '9', progress: '100%', note: '防水処理良好' },
  { process: '光ファイバ融着', plan: '07/13-07/18', actual: '07/13-07/18', people: '12', progress: '100%', note: '損失基準内' },
  { process: '接続損失測定', plan: '07/18-07/22', actual: '07/20-', people: '4', progress: '60%', note: '要員不足で遅延' },
  { process: 'ONU設置', plan: '07/21-07/24', actual: '07/21-', people: '4', progress: '20%', note: '' },
]

const COLS: { key: keyof Row; label: string; w: number }[] = [
  { key: 'process', label: '工程', w: 160 },
  { key: 'plan', label: '予定期間', w: 130 },
  { key: 'actual', label: '実績期間', w: 130 },
  { key: 'people', label: '延べ人数', w: 90 },
  { key: 'progress', label: '進捗', w: 80 },
  { key: 'note', label: '備考', w: 220 },
]

export default function Reports() {
  const { toast, confirm } = useApp()
  const [type, setType] = useState(reportTypes[0])
  const [rows, setRows] = useState<Row[]>(initialRows)
  const [output, setOutput] = useState<null | string>(null)
  const [preview, setPreview] = useState(false)
  const [exporting, setExporting] = useState(false)

  // 実ファイル生成（PostgreSQL→FastAPI→帳票→ダウンロード）。未対応帳票はデモ表示。
  async function exportReport(format: 'pdf' | 'xlsx', label: string) {
    const key = REPORT_KEY[type]
    if (!key) { setOutput(label); return }
    setExporting(true)
    try {
      await downloadReport(key, DEMO_PROJECT_ID, format)
      toast(`${label}を出力しました`, 'ok')
    } catch {
      toast('帳票の生成に失敗しました', 'ng')
    } finally {
      setExporting(false)
    }
  }

  function setCell(ri: number, key: keyof Row, val: string) {
    setRows((prev) => prev.map((r, i) => (i === ri ? { ...r, [key]: val } : r)))
  }
  function addRow() {
    setRows((prev) => [...prev, { process: '', plan: '', actual: '', people: '', progress: '', note: '' }])
    toast('行を追加しました', 'ok')
  }
  async function delRow(ri: number) {
    const ok = await confirm({ title: '行の削除', message: 'この行を削除しますか？', confirmLabel: '削除', danger: true })
    if (ok) { setRows((prev) => prev.filter((_, i) => i !== ri)); toast('行を削除しました', 'ok') }
  }

  return (
    <div>
      <PageHeader
        breadcrumb={[{ label: '報告書' }]}
        title="報告書"
        description="各種帳票の作成・出力（Excel風）"
      />
      <div className="flex gap-4">
        {/* 左：報告書種類 */}
        <div className="w-56 shrink-0">
          <Panel title="報告書種類" bodyClassName="p-0">
            <ul className="divide-y divide-line">
              {reportTypes.map((t) => (
                <li key={t}>
                  <button onClick={() => setType(t)} className={`flex w-full items-center gap-2 px-3 py-2.5 text-left text-[13px] hover:bg-canvas ${type === t ? 'bg-sysken-50 font-medium text-sysken-700' : 'text-ink'}`}>
                    <FileSpreadsheet size={15} className={type === t ? 'text-sysken-500' : 'text-ink-soft'} />{t}
                  </button>
                </li>
              ))}
            </ul>
          </Panel>
        </div>

        {/* 右：帳票 */}
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex items-center gap-1 rounded border border-line bg-white px-2 py-1.5">
            <button className="btn-ghost btn-xs" onClick={addRow}><Plus size={14} />行追加</button>
            <button className="btn-ghost btn-xs" onClick={() => toast('この操作は現在準備中です')}><Filter size={14} />フィルター</button>
            <button className="btn-ghost btn-xs" onClick={() => toast('この操作は現在準備中です')}>固定行</button>
            <button className="btn-ghost btn-xs" onClick={() => toast('この操作は現在準備中です')}>コピー</button>
            <button className="btn-ghost btn-xs" onClick={() => toast('この操作は現在準備中です')}>貼り付け</button>
            <div className="mx-1 h-5 w-px bg-line" />
            <button className="btn-ghost btn-xs" onClick={() => setPreview(true)}><Eye size={14} />プレビュー</button>
            <div className="ml-auto flex items-center gap-1">
              <button className="btn-default btn-xs" disabled={exporting} onClick={() => exportReport('pdf', 'PDF')}><FileText size={14} />PDF出力</button>
              <button className="btn-default btn-xs" disabled={exporting} onClick={() => exportReport('xlsx', 'Excel')}><FileSpreadsheet size={14} />Excel出力</button>
              <button className="btn-default btn-xs" onClick={() => setOutput('CSV')}><FileDown size={14} />CSV出力</button>
              <button className="btn-default btn-xs" onClick={() => toast('この操作は現在準備中です')}><Printer size={14} />印刷</button>
            </div>
          </div>

          <Panel bodyClassName="p-0" className="overflow-hidden">
            <div className="border-b border-line bg-canvas px-4 py-2.5">
              <h2 className="text-sm font-bold text-ink">{type}</h2>
              <p className="text-xs text-ink-soft">熊本中央局 光設備更改工事 ／ 作成日 2026/07/21 ／ 作成者 山田 太郎</p>
            </div>
            <div className="thin-scroll overflow-x-auto">
              <table className="text-[13px]" style={{ borderCollapse: 'separate', borderSpacing: 0 }}>
                <thead>
                  <tr>
                    <th className="border-b border-r border-line bg-slate-100 px-2 py-1.5 text-ink-soft" style={{ width: 36 }}>#</th>
                    {COLS.map((c) => <th key={c.key} className="border-b border-r border-line bg-slate-100 px-2 py-1.5 text-left font-semibold text-ink" style={{ width: c.w }}>{c.label}</th>)}
                    <th className="border-b border-line bg-slate-100 px-2 py-1.5" style={{ width: 44 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, ri) => (
                    <tr key={ri} className={ri % 2 ? 'bg-white' : 'bg-slate-50/40'}>
                      <td className="border-b border-r border-line bg-slate-100 px-2 py-1 text-center text-ink-soft">{ri + 1}</td>
                      {COLS.map((c) => (
                        <td key={c.key} className="border-b border-r border-line p-0">
                          <input value={r[c.key]} onChange={(e) => setCell(ri, c.key, e.target.value)}
                            className={`w-full bg-transparent px-2 py-1 outline-none focus:bg-sysken-50 focus:outline-2 focus:-outline-offset-2 focus:outline-sysken-500 ${c.key === 'people' || c.key === 'progress' ? 'text-right tabular-nums' : ''}`} />
                        </td>
                      ))}
                      <td className="border-b border-line px-2 py-1 text-center"><button onClick={() => delRow(ri)} className="text-ink-soft hover:text-ng"><Trash2 size={14} /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>
      </div>

      {/* 出力ステップ */}
      <StepRunner open={!!output} title={`${output ?? ''}出力`} steps={['データを集計しています', '帳票を生成しています', '出力準備が完了しました']} finalNote="デモ環境のため、実ファイルは生成されません。" onClose={() => setOutput(null)} />

      {/* プレビュー */}
      <Modal open={preview} onClose={() => setPreview(false)} title={`${type} プレビュー`} size="lg" footer={<button className="btn-primary" onClick={() => setPreview(false)}>閉じる</button>}>
        <div className="rounded border border-line p-6">
          <h3 className="text-center text-base font-bold">{type}</h3>
          <p className="mt-1 text-center text-xs text-ink-soft">熊本中央局 光設備更改工事</p>
          <table className="mt-4 w-full border border-line text-[12px]">
            <thead><tr className="bg-slate-100">{COLS.map((c) => <th key={c.key} className="border border-line px-2 py-1 text-left">{c.label}</th>)}</tr></thead>
            <tbody>{rows.map((r, i) => <tr key={i}>{COLS.map((c) => <td key={c.key} className="border border-line px-2 py-1">{r[c.key] || '—'}</td>)}</tr>)}</tbody>
          </table>
          <div className="mt-6 flex justify-end gap-8 text-xs"><span>確認：____________</span><span>承認：____________</span></div>
        </div>
      </Modal>
    </div>
  )
}
