/**
 * 報告書。
 *
 * 帳票の内容は **API（GET /reports/{type}/preview）が正データ**で、画面・プレビュー・
 * 印刷・PDF・Excel・CSV はすべて同じ内容から作る。画面側で行を作らないため、
 * 表示した工程がそのまま同じ順序・同じ値で出力される。
 *
 * 施工管理表は工程（tasks）から自動生成する帳票で、画面上では編集しない。
 * 手入力の帳票を扱う場合は、下書きをDBへ保存する仕組みが別途必要になる（未提供）。
 */
import { useState } from 'react'
import { FileSpreadsheet, FileDown, FileText, Printer, Eye, Loader2, AlertTriangle } from 'lucide-react'
import { PageHeader } from '../components/layout/Breadcrumb'
import { Panel } from '../components/ui/common'
import { Modal } from '../components/ui/Modal'
import { useApp } from '../context/AppContext'
import { downloadReport, useReportPreview, type ReportFormat } from '../api/reports'
import { ApiError } from '../lib/apiClient'
import { FixedProject, ProjectSelect, useSelectedProject, NoProjectSelected } from '../components/ui/ProjectSelect'

// バックエンドが実ファイルを生成できる帳票（type表示名 → APIキー）
const REPORT_KEY: Record<string, string> = { 施工管理表: 'construction-management' }

const reportTypes = [
  '施工管理表', '工程進捗報告書', '施工写真台帳', '現場日報一覧',
  '品質確認報告書', '完成報告書', '要員実績表', '安全管理報告書',
]

export default function Reports() {
  const { toast } = useApp()
  const [type, setType] = useState(reportTypes[0])
  // 帳票の対象案件は利用者が選ぶ（固定案件へ出力しない）
  const { projectId, setProjectId, fixedByPath } = useSelectedProject()
  const reportKey = REPORT_KEY[type]
  const { data: report, isLoading, isError, error } = useReportPreview(reportKey, projectId)
  const [preview, setPreview] = useState(false)
  const [unsupported, setUnsupported] = useState<string | null>(null)
  const [exporting, setExporting] = useState<ReportFormat | null>(null)

  async function exportReport(format: ReportFormat, label: string) {
    if (!reportKey) { setUnsupported(`${type}の${label}`); return }
    if (!projectId) { toast('対象案件を選択してください', 'ng'); return }
    setExporting(format)
    try {
      await downloadReport(reportKey, projectId, format)
      toast(`${label}を出力しました`, 'ok')
    } catch {
      toast('帳票の生成に失敗しました', 'ng')
    } finally {
      setExporting(null)
    }
  }

  const header = (
    <PageHeader
      breadcrumb={[{ label: '報告書' }]}
      title="報告書"
      description={projectId ? '工程から自動生成する帳票（画面・PDF・Excel・CSV は同じ内容）' : '対象案件を選択してください'}
      actions={
        <div className="flex items-center gap-2">
          <span className="text-[12px] text-ink-soft">対象案件</span>
          {fixedByPath
            ? <FixedProject label={report ? `${report.construction_number} ${report.project_name}` : undefined} />
            : <ProjectSelect projectId={projectId} onChange={setProjectId} />}
        </div>
      }
    />
  )

  // 案件未選択のときは空状態だけ（編集・出力・印刷の入口を出さない）
  if (!projectId) {
    return <div>{header}<Panel><NoProjectSelected what="その案件の工程から作る帳票" /></Panel></div>
  }
  // 帳票の内容はAPIが正データなので画面側に案件依存stateは持たないが、
  // 案件を変えたらプレビューの開閉なども確実に初期化されるよう key で作り直す。

  return (
    <div>
      {header}
      <div className="flex gap-4">
        {/* 左：報告書種類 */}
        <div className="w-56 shrink-0">
          <Panel title="報告書種類" bodyClassName="p-0">
            <ul className="divide-y divide-line">
              {reportTypes.map((t) => (
                <li key={t}>
                  <button onClick={() => setType(t)} data-report-type={t}
                    className={`flex w-full items-center gap-2 px-3 py-2.5 text-left text-[13px] hover:bg-canvas ${type === t ? 'bg-sysken-50 font-medium text-sysken-700' : 'text-ink'}`}>
                    <FileSpreadsheet size={15} className={type === t ? 'text-sysken-500' : 'text-ink-soft'} />
                    <span className="flex-1">{t}</span>
                    {!REPORT_KEY[t] && <span className="rounded bg-slate-100 px-1 py-0.5 text-[10px] text-ink-soft">未対応</span>}
                  </button>
                </li>
              ))}
            </ul>
          </Panel>
        </div>

        {/* 右：帳票 */}
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex items-center gap-1 rounded border border-line bg-white px-2 py-1.5">
            <span className="text-[12px] text-ink-soft">
              {reportKey ? '工程から自動生成（画面上では編集しません）' : 'この帳票は未対応です'}
            </span>
            <div className="ml-auto flex items-center gap-1">
              <button className="btn-ghost btn-xs" data-report-preview disabled={!report}
                onClick={() => setPreview(true)}><Eye size={14} />プレビュー</button>
              <button className="btn-default btn-xs" disabled={!!exporting}
                onClick={() => void exportReport('pdf', 'PDF')}><FileText size={14} />PDF出力</button>
              <button className="btn-default btn-xs" disabled={!!exporting}
                onClick={() => void exportReport('xlsx', 'Excel')}><FileSpreadsheet size={14} />Excel出力</button>
              <button className="btn-default btn-xs" disabled={!!exporting}
                onClick={() => void exportReport('csv', 'CSV')}><FileDown size={14} />CSV出力</button>
              <button className="btn-default btn-xs" disabled={!report}
                onClick={() => window.print()}><Printer size={14} />印刷</button>
            </div>
          </div>

          {!reportKey ? (
            <Panel>
              <div className="flex flex-col items-center gap-2 py-12 text-center">
                <AlertTriangle size={26} className="text-slate-300" />
                <p className="text-[14px] font-semibold text-ink">{type}は未対応です</p>
                <p className="max-w-md text-[13px] text-ink-soft">
                  実ファイルを生成できるのは「施工管理表」です。左の一覧から選択してください。
                </p>
              </div>
            </Panel>
          ) : isLoading ? (
            <Panel><div className="flex items-center justify-center gap-2 py-14 text-ink-soft"><Loader2 size={20} className="animate-spin text-sysken-500" />帳票を作成しています…</div></Panel>
          ) : isError ? (
            <Panel><div className="flex flex-col items-center gap-2 py-12 text-ng">
              <AlertTriangle size={26} />
              <p className="text-[13px]">{error instanceof ApiError ? error.message : '帳票の取得に失敗しました'}</p>
            </div></Panel>
          ) : report ? (
            <Panel bodyClassName="p-0" className="overflow-hidden" data-print="sheet">
              <div className="border-b border-line bg-canvas px-4 py-2.5">
                <h2 className="text-sm font-bold text-ink">{report.title}</h2>
                <p className="text-xs text-ink-soft" data-report-meta>
                  {report.meta.map((m) => `${m.label}：${m.value}`).join(' ／ ')}
                </p>
              </div>
              <div className="thin-scroll overflow-x-auto">
                <table className="text-[13px]" data-print="wide" style={{ borderCollapse: 'separate', borderSpacing: 0 }}>
                  <thead>
                    <tr>
                      <th className="border-b border-r border-line bg-slate-100 px-2 py-1.5 text-ink-soft" style={{ width: 36 }}>#</th>
                      {report.columns.map((c) => (
                        <th key={c} className="border-b border-r border-line bg-slate-100 px-2 py-1.5 text-left font-semibold text-ink">{c}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {report.rows.length === 0 && (
                      <tr>
                        <td colSpan={report.columns.length + 1} className="border-b border-line px-3 py-8 text-center text-[13px] text-ink-soft">
                          この案件には工程が登録されていません。工程を登録すると帳票へ反映されます。
                        </td>
                      </tr>
                    )}
                    {report.rows.map((r, ri) => (
                      <tr key={ri} data-report-row={ri} className={ri % 2 ? 'bg-white' : 'bg-slate-50/40'}>
                        <td className="border-b border-r border-line bg-slate-100 px-2 py-1 text-center text-ink-soft">{ri + 1}</td>
                        {r.map((v, ci) => (
                          <td key={ci} className="border-b border-r border-line px-2 py-1 text-ink">{v}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="border-t border-line px-3 py-1.5 text-xs text-ink-soft" data-report-count={report.row_count}>
                {report.row_count}件の工程（PDF・Excel・CSV も同じ内容で出力されます）
              </div>
            </Panel>
          ) : null}
        </div>
      </div>

      {/* 未対応の出力。生成中の演出は出さず、対応範囲をそのまま伝える */}
      <Modal open={!!unsupported} onClose={() => setUnsupported(null)} title="この出力は未対応です"
        footer={<button className="btn-primary" onClick={() => setUnsupported(null)}>閉じる</button>}>
        <div className="space-y-2 px-1 py-2 text-[13px] text-ink">
          <p>{unsupported} は、まだ実ファイルを生成できません。</p>
          <p className="text-ink-soft">現在、実ファイルを生成できるのは「施工管理表」の PDF ／ Excel ／ CSV です。</p>
        </div>
      </Modal>

      {/* プレビュー（画面と同じ内容＝出力と同じ内容） */}
      <Modal open={preview} onClose={() => setPreview(false)} title={`${type} プレビュー`} size="xl"
        footer={<button className="btn-primary" onClick={() => setPreview(false)}>閉じる</button>}>
        {report && (
          <div className="rounded border border-line p-6">
            <h3 className="text-center text-base font-bold">{report.title}</h3>
            <p className="mt-1 text-center text-xs text-ink-soft" data-preview-project>
              {report.construction_number} {report.project_name}
            </p>
            <table className="mt-4 w-full border border-line text-[12px]">
              <thead><tr className="bg-slate-100">{report.columns.map((c) => <th key={c} className="border border-line px-2 py-1 text-left">{c}</th>)}</tr></thead>
              <tbody>
                {report.rows.length === 0 && (
                  <tr><td colSpan={report.columns.length} className="border border-line px-2 py-6 text-center text-ink-soft">工程が登録されていません</td></tr>
                )}
                {report.rows.map((r, i) => (
                  <tr key={i} data-preview-row={i}>{r.map((v, ci) => <td key={ci} className="border border-line px-2 py-1">{v}</td>)}</tr>
                ))}
              </tbody>
            </table>
            <div className="mt-6 flex justify-end gap-8 text-xs"><span>確認：____________</span><span>承認：____________</span></div>
          </div>
        )}
      </Modal>
    </div>
  )
}
