import { useMemo, useState } from 'react'
import { ScanSearch, CheckCircle2, RotateCcw, PauseCircle, ArrowRight } from 'lucide-react'
import { PageHeader } from '../components/layout/Breadcrumb'
import { Panel } from '../components/ui/common'
import { StatusBadge } from '../components/ui/Badge'
import { Modal } from '../components/ui/Modal'
import { PhotoPlaceholder } from '../components/ui/PhotoPlaceholder'
import { useApp } from '../context/AppContext'
import { useQualityChecks, useUpdateQualityCheck } from '../api/quality'
import { useProject } from '../api/projects'
import { usePhotos } from '../api/photos'
import { FixedProject, NoProjectSelected, ProjectSelect, projectLabel, useSelectedProject } from '../components/ui/ProjectSelect'
import { ProjectScope } from '../components/ui/ProjectScope'
import { useTestRecords, useCreateTestRecord } from '../api/testRecords'
import { useAssets } from '../api/sites'
import { useTaskOptions } from '../api/tasks'
import type { QualityItem, QualityStatus } from '../types'

const flow = ['写真登録', 'AI画像認識', '品質確認', 'コメント入力', '修正・再撮影依頼', '再確認', '承認']

/**
 * 品質管理。
 *
 * 案件に紐づく状態（開いている詳細・入力中のコメント・試験記録の入力）は
 * `QualityBody` が持ち、`key={projectId}` で案件ごとに作り直す。
 */
export default function Quality() {
  const { projectId, setProjectId } = useSelectedProject()
  // 案件が変わる／未選択へ戻る間は、前の案件の内容を描かない（ProjectScope が伏せる）
  return (
    <ProjectScope projectId={projectId}>
      {projectId
        ? <QualityBody key={projectId} projectId={projectId} />
        : (
      <div>
        <PageHeader
          breadcrumb={[{ label: '品質管理' }]}
          title="品質管理"
          description="対象案件を選択してください"
          actions={
            <div className="flex items-center gap-2">
              <span className="text-[12px] text-ink-soft">対象案件</span>
              <ProjectSelect projectId={undefined} onChange={setProjectId} />
            </div>
          }
        />
        <Panel><NoProjectSelected what="品質確認と試験記録" /></Panel>
      </div>
        )}
    </ProjectScope>
  )
}

function QualityBody({ projectId }: { projectId: number }) {
  const { toast } = useApp()
  const { fixedByPath, setProjectId } = useSelectedProject()
  const { data: project } = useProject(projectId)
  const { data: items = [], isLoading, isError, refetch } = useQualityChecks(projectId)
  const { data: photos = [] } = usePhotos(projectId)
  const updateMut = useUpdateQualityCheck()
  const [detail, setDetail] = useState<QualityItem | null>(null)
  const [anomalyOpen, setAnomalyOpen] = useState(false)
  const [comment, setComment] = useState('')

  const photoById = useMemo(() => new Map(photos.map((p) => [p.id, p])), [photos])

  function act(id: string, status: QualityStatus, msg: string) {
    updateMut.mutate(
      { id, status, comment: comment || undefined },
      {
        onSuccess: () => { toast(msg, 'ok'); setDetail(null); setComment('') },
        onError: () => toast('保存に失敗しました', 'ng'),
      },
    )
  }

  const summary = useMemo(() => {
    const count = (s: string) => items.filter((q) => q.status === s).length
    return {
      確認待ち: count('確認待ち'), 不足: count('情報不足'), 未提出: count('未提出'), 警告: count('警告'),
      確認済み: count('確認済み'), 再撮影依頼: count('再撮影依頼'), 承認済み: count('承認済み'),
    }
  }, [items])

  const summaryTiles: { label: string; value: number; tone: 'warn' | 'ng' | 'ok' | 'info' }[] = [
    { label: '確認待ち', value: summary.確認待ち, tone: 'warn' },
    { label: '不足', value: summary.不足, tone: 'warn' },
    { label: '未提出', value: summary.未提出, tone: 'ng' },
    { label: '警告', value: summary.警告, tone: 'warn' },
    { label: '確認済み', value: summary.確認済み, tone: 'ok' },
    { label: '再撮影依頼', value: summary.再撮影依頼, tone: 'ng' },
    { label: '承認済み', value: summary.承認済み, tone: 'ok' },
  ]

  return (
    // どの案件を表示している画面かをDOMにも持たせる（切替時の混在検証に使う）
    <div data-project-scope={projectId}>
      <PageHeader
        breadcrumb={[{ label: '品質管理' }]}
        title="品質管理"
        description="施工写真・検査項目の確認と承認"
        actions={
          <div className="flex items-center gap-2">
            <span className="text-[12px] text-ink-soft">対象案件</span>
            {fixedByPath
              ? <FixedProject label={project ? projectLabel(project) : undefined} />
              : <ProjectSelect projectId={projectId} onChange={setProjectId} />}
            <button className="btn-default" onClick={() => setAnomalyOpen(true)}><ScanSearch size={15} />AI品質チェック</button>
          </div>
        }
      />

      {/* 集計 */}
      <div className="mb-3 grid grid-cols-7 gap-2">
        {summaryTiles.map((t) => (
          <div key={t.label} className="rounded border border-line bg-white px-3 py-2.5 text-center shadow-panel">
            <p className={`text-2xl font-bold ${t.tone === 'ng' ? 'text-ng' : t.tone === 'warn' ? 'text-warn' : t.tone === 'ok' ? 'text-ok' : 'text-sysken-600'}`}>{t.value}</p>
            <p className="mt-0.5 text-[11px] text-ink-soft">{t.label}</p>
          </div>
        ))}
      </div>

      {/* 業務フロー */}
      <Panel title="品質確認フロー" className="mb-3">
        <div className="flex flex-wrap items-center gap-1">
          {flow.map((f, i) => (
            <div key={f} className="flex items-center gap-1">
              <span className={`rounded px-2.5 py-1 text-xs ${i === 2 ? 'bg-sysken-500 font-medium text-white' : 'bg-canvas text-ink-soft'}`}>{f}</span>
              {i < flow.length - 1 && <ArrowRight size={14} className="text-slate-300" />}
            </div>
          ))}
        </div>
      </Panel>

      {/* 読込・エラー・空 状態 */}
      {isLoading && <div className="rounded border border-line bg-white px-4 py-10 text-center text-[13px] text-ink-soft">品質チェックを読み込んでいます…</div>}
      {isError && (
        <div className="rounded border border-red-200 bg-red-50 px-4 py-6 text-center text-[13px] text-ng">
          品質チェックの取得に失敗しました。<button className="ml-2 underline" onClick={() => refetch()}>再試行</button>
        </div>
      )}
      {!isLoading && !isError && items.length === 0 && (
        <div className="rounded border border-line bg-white px-4 py-10 text-center text-[13px] text-ink-soft">品質チェックはまだ登録されていません。</div>
      )}

      {/* 一覧 */}
      {!isLoading && !isError && items.length > 0 && (
      <Panel bodyClassName="p-0" className="overflow-hidden">
        <div className="thin-scroll overflow-x-auto">
          <table className="grid-table text-[13px]">
            <thead className="bg-canvas text-[12.5px] text-ink-soft">
              <tr>
                {['対象写真', '案件', '工程', '検査項目', '判定', 'コメント', '担当者', '確認者', '対応期限', 'ステータス', ''].map((h) => (
                  <th key={h} className="px-3 py-2 text-left font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((q) => {
                const ph = photoById.get(q.photoId)
                return (
                  <tr key={q.id} className="cursor-pointer hover:bg-canvas" onClick={() => { setDetail(q); setComment('') }}>
                    <td className="py-1.5 pl-3"><div className="h-10 w-14 overflow-hidden rounded">{ph ? <PhotoPlaceholder type={ph.colorKey} className="h-full w-full" /> : '—'}</div></td>
                    <td className="px-3 text-ink-soft" data-quality-project>{project ? `${project.construction_number} ${project.name}` : '—'}</td>
                    <td className="px-3">{q.process}</td>
                    <td className="px-3">{q.inspectItem}</td>
                    <td className="px-3"><StatusBadge status={q.judge} /></td>
                    <td className="max-w-[220px] truncate px-3 text-ink-soft">{q.comment || '—'}</td>
                    <td className="px-3 text-ink-soft">{q.worker}</td>
                    <td className="px-3 text-ink-soft">{q.checker}</td>
                    <td className="px-3 tabular-nums text-ink-soft">{q.dueDate.slice(5)}</td>
                    <td className="px-3"><StatusBadge status={q.status} /></td>
                    <td className="px-3 text-sysken-600">詳細</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Panel>
      )}

      {/* 試験記録（光工事：光損失/OTDR/導通確認） */}
      <TestRecordsPanel projectId={projectId} />

      {/* 詳細モーダル */}
      <Modal open={!!detail} onClose={() => setDetail(null)} title={detail ? `品質確認：${detail.inspectItem}` : ''} size="lg"
        footer={detail && (
          <>
            <button className="btn-default" onClick={() => act(detail.id, '確認済み', '保留にしました')}><PauseCircle size={15} />保留</button>
            <button className="btn-danger" onClick={() => act(detail.id, '再撮影依頼', '再撮影を依頼しました')}><RotateCcw size={15} />再撮影依頼</button>
            <button className="btn-primary" onClick={() => act(detail.id, '承認済み', '承認しました')}><CheckCircle2 size={15} />承認</button>
          </>
        )}>
        {detail && (() => {
          const ph = photoById.get(detail.photoId)
          return (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="overflow-hidden rounded border border-line">
                  {ph ? <PhotoPlaceholder type={ph.colorKey} no={ph.no} className="aspect-[4/3] w-full" /> : null}
                </div>
                <div className="mt-2 flex items-center gap-1.5 rounded border border-sysken-200 bg-sysken-50 px-2 py-1 text-[12px] text-sysken-700">
                  <span className="font-medium">AI認識結果：{ph?.aiCandidate}</span>
                </div>
              </div>
              <div className="space-y-3 text-[13px]">
                <KV label="工程" value={detail.process} />
                <KV label="検査項目" value={detail.inspectItem} />
                <KV label="判定" value={<StatusBadge status={detail.judge} />} />
                <KV label="担当者" value={detail.worker} />
                <KV label="品質担当者" value={detail.checker} />
                <KV label="対応期限" value={detail.dueDate} />
                <div>
                  <p className="mb-1 text-xs font-semibold text-ink-soft">過去コメント</p>
                  <p className="rounded border border-line bg-canvas px-2 py-1.5 text-ink">{detail.comment || 'コメントはありません'}</p>
                </div>
                <div>
                  <label className="label">担当者コメント</label>
                  <textarea className="field h-16 resize-none" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="確認コメントを入力..." />
                </div>
              </div>
            </div>
          )
        })()}
      </Modal>

      {/* AI施工品質チェック（AI解析結果が登録されると表示。現在は未連携） */}
      <Modal open={anomalyOpen} onClose={() => setAnomalyOpen(false)} title="AI施工品質チェック" size="lg">
        <div className="flex flex-col items-center justify-center gap-3 px-4 py-12 text-center">
          <ScanSearch size={40} className="text-slate-300" />
          <p className="text-[14px] font-semibold text-ink">AI解析結果なし</p>
          <p className="max-w-md text-[13px] leading-relaxed text-ink-soft">
            施工写真と完成基準を比較し、不良箇所を自動検出するAI施工品質チェックは現在準備中です。
            AI解析結果が登録されると、検出箇所・判定結果・対応期限がここに表示されます。
          </p>
          <p className="text-[12px] text-ink-soft">
            写真単位のAI物体検出結果は「施工写真」画面の各写真詳細で確認できます。
          </p>
        </div>
      </Modal>
    </div>
  )
}

function KV({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="flex justify-between gap-3"><span className="shrink-0 text-ink-soft">{label}</span><span className="text-right text-ink">{value}</span></div>
}

function TestRecordsPanel({ projectId }: { projectId: number }) {
  const { toast } = useApp()
  const { data: records = [], isLoading } = useTestRecords(projectId)
  const { data: assets = [] } = useAssets(projectId, undefined)
  const { data: tasks = [] } = useTaskOptions(projectId)
  const createMut = useCreateTestRecord()
  const [open, setOpen] = useState(false)
  const empty = { test_type: '光損失測定', asset_id: '', task_id: '', measured_value: '', unit: 'dB', standard_value: '≤0.5dB', judge: '合格', instrument: '', comment: '' }
  const [form, setForm] = useState(empty)

  function submit() {
    // 登録先の案件は実行前に検証する（強制キャストで通さない）
    if (!projectId) { toast('対象案件を選択してください', 'ng'); return }
    createMut.mutate({
      project_id: projectId, test_type: form.test_type,
      asset_id: form.asset_id ? Number(form.asset_id) : null, task_id: form.task_id ? Number(form.task_id) : null,
      measured_value: form.measured_value || undefined, unit: form.unit || undefined, standard_value: form.standard_value || undefined,
      judge: form.judge, instrument: form.instrument || undefined, comment: form.comment || undefined,
    }, {
      onSuccess: () => { setOpen(false); setForm(empty); toast('試験記録を登録しました', 'ok') },
      onError: () => toast('登録に失敗しました', 'ng'),
    })
  }

  return (
    <Panel title="試験記録（光損失 / OTDR / 導通確認）" className="mt-3" bodyClassName="p-0"
      action={<button className="btn-default btn-xs" data-add-test-record onClick={() => setOpen(true)}>＋ 試験記録を追加</button>}>
      <div className="thin-scroll overflow-x-auto">
        <table className="grid-table text-[13px]">
          <thead className="bg-canvas text-[12.5px] text-ink-soft"><tr>{['試験種別', '設備', '工程', '測定値', '基準値', '判定', '測定器', '測定者'].map((h) => <th key={h} className="px-3 py-2 text-left font-semibold">{h}</th>)}</tr></thead>
          <tbody>
            {isLoading && <tr><td colSpan={8} className="px-3 py-6 text-center text-ink-soft">読み込み中…</td></tr>}
            {!isLoading && records.length === 0 && <tr><td colSpan={8} className="px-3 py-6 text-center text-ink-soft">試験記録がありません。</td></tr>}
            {records.map((r) => (
              <tr key={r.id} className="hover:bg-canvas">
                <td className="px-3 py-1.5 font-medium">{r.test_type}</td>
                <td className="px-3 text-ink-soft">{r.asset ?? '—'}</td>
                <td className="px-3 text-ink-soft">{r.task ?? '—'}</td>
                <td className="px-3 tabular-nums">{r.measured_value ?? '—'} {r.unit ?? ''}</td>
                <td className="px-3 text-ink-soft">{r.standard_value ?? '—'}</td>
                <td className="px-3"><StatusBadge status={r.judge === '合格' ? '合格' : r.judge === '不合格' ? '不合格' : '未判定'} /></td>
                <td className="px-3 text-ink-soft">{r.instrument ?? '—'}</td>
                <td className="px-3 text-ink-soft">{r.tester ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Modal open={open} onClose={() => setOpen(false)} title="試験記録を追加" size="lg"
        footer={<><button className="btn-default" onClick={() => setOpen(false)}>キャンセル</button><button className="btn-primary" disabled={createMut.isPending} onClick={submit}>{createMut.isPending ? '保存中…' : '登録'}</button></>}>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">試験種別</label><select className="field" value={form.test_type} onChange={(e) => setForm({ ...form, test_type: e.target.value })}>{['光損失測定', 'OTDR', '導通確認'].map((t) => <option key={t}>{t}</option>)}</select></div>
          <div><label className="label">判定</label><select className="field" value={form.judge} onChange={(e) => setForm({ ...form, judge: e.target.value })}>{['合格', '不合格', '未判定'].map((t) => <option key={t}>{t}</option>)}</select></div>
          <div><label className="label">設備（Asset）</label><select className="field" value={form.asset_id} onChange={(e) => setForm({ ...form, asset_id: e.target.value })}><option value="">未選択</option>{assets.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
          <div><label className="label">工程（Task）</label><select className="field" value={form.task_id} onChange={(e) => setForm({ ...form, task_id: e.target.value })}><option value="">未選択</option>{tasks.map((t) => <option key={t.id} value={t.id}>{t.wbs} {t.name}</option>)}</select></div>
          <div><label className="label">測定値</label><input className="field" value={form.measured_value} onChange={(e) => setForm({ ...form, measured_value: e.target.value })} placeholder="例：0.28" /></div>
          <div><label className="label">単位</label><input className="field" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} /></div>
          <div><label className="label">基準値</label><input className="field" value={form.standard_value} onChange={(e) => setForm({ ...form, standard_value: e.target.value })} /></div>
          <div><label className="label">測定器</label><input className="field" value={form.instrument} onChange={(e) => setForm({ ...form, instrument: e.target.value })} placeholder="例：OTDR AQ7280" /></div>
          <div className="col-span-2"><label className="label">コメント</label><input className="field" value={form.comment} onChange={(e) => setForm({ ...form, comment: e.target.value })} /></div>
        </div>
      </Modal>
    </Panel>
  )
}
