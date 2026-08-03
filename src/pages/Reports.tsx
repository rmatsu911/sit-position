import { useEffect, useMemo, useState } from 'react'
import { FileSpreadsheet, FileDown, FileText, Printer, Plus, Trash2, Eye, Filter } from 'lucide-react'
import { PageHeader } from '../components/layout/Breadcrumb'
import { Panel } from '../components/ui/common'
import { Modal } from '../components/ui/Modal'
import { useApp } from '../context/AppContext'
import { useAuth } from '../auth/AuthContext'
import { downloadReport } from '../api/reports'
import { useProject } from '../api/projects'
import { useProjectTasks } from '../api/tasks'
import { formatPeriod, jstDateKey } from '../lib/timeline'
import { ProjectSelect, useSelectedProject, NoProjectSelected } from '../components/ui/ProjectSelect'

// バックエンドで実生成に対応した帳票（type表示名 → APIキー）
const REPORT_KEY: Record<string, string> = { 施工管理表: 'construction-management' }

const reportTypes = [
  '施工管理表', '工程進捗報告書', '施工写真台帳', '現場日報一覧',
  '品質確認報告書', '完成報告書', '要員実績表', '安全管理報告書',
]

type Row = { process: string; plan: string; actual: string; people: string; progress: string; note: string }
const EMPTY_ROW: Row = { process: '', plan: '', actual: '', people: '', progress: '', note: '' }

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
  // 帳票の対象案件は利用者が選ぶ（固定案件へ出力しない）
  const { projectId, setProjectId } = useSelectedProject()
  const { user } = useAuth()
  const { data: project } = useProject(projectId)
  const { data: tasks = [], isLoading: tasksLoading } = useProjectTasks(projectId)
  // 帳票の初期値は選択した案件の工程（実データ）。編集したときだけ画面側で保持する。
  const baseRows: Row[] = useMemo(
    () => tasks.filter((t) => !t.isParent).map((t) => ({
      process: t.name,
      plan: formatPeriod(t.planStartAt, t.planEndAt, t.precision),
      actual: t.actualStartAt ? formatPeriod(t.actualStartAt, t.actualEndAt ?? t.actualStartAt, t.precision) : '',
      people: String(t.actualPeople || t.planPeople || ''),
      progress: `${t.progress}%`,
      note: '',
    })),
    [tasks],
  )
  const [edited, setEdited] = useState<Row[] | null>(null)
  // 案件を切り替えたら、前の案件の編集内容を持ち越さない
  useEffect(() => { setEdited(null) }, [projectId])
  const rows = edited ?? baseRows
  const setRows = (next: Row[] | ((prev: Row[]) => Row[])) =>
    setEdited(typeof next === 'function' ? next(rows) : next)
  const [output, setOutput] = useState<null | string>(null)
  const [preview, setPreview] = useState(false)
  const [exporting, setExporting] = useState(false)

  // 実ファイル生成（PostgreSQL→FastAPI→帳票→ダウンロード）。
  // 実装のない帳票は、生成したように見せず「未対応」と伝える。
  async function exportReport(format: 'pdf' | 'xlsx', label: string) {
    const key = REPORT_KEY[type]
    if (!key) { setOutput(`${type}の${label}`); return }
    if (!projectId) { toast('対象案件を選択してください', 'ng'); return }
    setExporting(true)
    try {
      await downloadReport(key, projectId, format)
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
    setRows((prev) => [...prev, { ...EMPTY_ROW }])
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
        actions={
          <div className="flex items-center gap-2">
            <span className="text-[12px] text-ink-soft">対象案件</span>
            <ProjectSelect projectId={projectId} onChange={setProjectId} />
          </div>
        }
      />
      {/* 案件未選択のときは空状態だけを出す。
          行追加・編集・削除・プレビュー・PDF/Excel/CSV出力・印刷はいずれも描画しない。 */}
      {!projectId ? <Panel><NoProjectSelected what="その案件の工程から帳票の下書き" /></Panel> : (
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
              <button className="btn-default btn-xs" onClick={() => setOutput(`${type}のCSV出力`)}><FileDown size={14} />CSV出力</button>
              <button className="btn-default btn-xs" onClick={() => toast('この操作は現在準備中です')}><Printer size={14} />印刷</button>
            </div>
          </div>

          <Panel bodyClassName="p-0" className="overflow-hidden">
            <div className="border-b border-line bg-canvas px-4 py-2.5">
              <h2 className="text-sm font-bold text-ink">{type}</h2>
              <p className="text-xs text-ink-soft">
                {project ? `${project.construction_number} ${project.name}` : '対象案件が未選択です'}
                {' ／ 作成日 '}{jstDateKey(new Date())}
                {' ／ 作成者 '}{user?.name ?? '—'}
              </p>
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
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={COLS.length + 2} className="border-b border-line px-3 py-6 text-center text-[13px] text-ink-soft">
                        {!projectId ? '案件を選択すると、その案件の工程が下書きとして入ります。'
                          : tasksLoading ? '工程を読み込んでいます...'
                          : 'この案件には工程が登録されていません。「行追加」から入力できます。'}
                      </td>
                    </tr>
                  )}
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
      )}

      {/* 未対応の出力。生成中の演出は出さず、対応範囲をそのまま伝える */}
      <Modal open={!!output} onClose={() => setOutput(null)} title="この出力は未対応です"
        footer={<button className="btn-primary" onClick={() => setOutput(null)}>閉じる</button>}>
        <div className="space-y-2 px-1 py-2 text-[13px] text-ink">
          <p>{output} は、まだ実ファイルを生成できません。</p>
          <p className="text-ink-soft">
            現在、実ファイルを生成できるのは「施工管理表」の PDF ／ Excel です。
            対象案件を選んで、その2つのボタンから出力してください。
          </p>
        </div>
      </Modal>

      {/* プレビュー */}
      <Modal open={preview} onClose={() => setPreview(false)} title={`${type} プレビュー`} size="lg" footer={<button className="btn-primary" onClick={() => setPreview(false)}>閉じる</button>}>
        <div className="rounded border border-line p-6">
          <h3 className="text-center text-base font-bold">{type}</h3>
          <p className="mt-1 text-center text-xs text-ink-soft" data-preview-project>
            {project ? `${project.construction_number} ${project.name}` : '対象案件が未選択です'}
          </p>
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
