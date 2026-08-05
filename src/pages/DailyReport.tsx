import { useEffect, useState } from 'react'
import { Save, Send, RotateCcw, CheckCircle2, Copy, FileText, Printer, Plus, GitBranch } from 'lucide-react'
import { PageHeader } from '../components/layout/Breadcrumb'
import { Panel } from '../components/ui/common'
import { StatusBadge } from '../components/ui/Badge'
import { Modal } from '../components/ui/Modal'
import { PhotoPlaceholder } from '../components/ui/PhotoPlaceholder'
import { useApp } from '../context/AppContext'
import {
  useDailyReports, useSaveDailyReport, useChangeDailyReportStatus, useCopyDailyReport, useCreateDailyReport,
  useSetDailyReportLinks, useReflectProgress, reflectProgress, toUpsertBody,
} from '../api/dailyReports'
import type { ReflectResult } from '../api/dailyReports'
import { useTaskOptions } from '../api/tasks'
import { useProject } from '../api/projects'
import { usePhotos } from '../api/photos'
import { FixedProject, NoProjectSelected, ProjectSelect, projectLabel, useSelectedProject } from '../components/ui/ProjectSelect'
import { ProjectScope } from '../components/ui/ProjectScope'
import type { DailyReport, ReportStatus } from '../types'

/**
 * 現場日報。
 *
 * 案件に紐づく状態（表示中の日報・編集中の内容・反映プレビュー）はすべて
 * `DailyReportBody` が持ち、`key={projectId}` で案件ごとに作り直す。
 * 案件を切り替えた瞬間に前の案件の日報が1フレームも残らない。
 */
export default function DailyReportPage() {
  const { projectId, setProjectId } = useSelectedProject()
  // 案件が変わる／未選択へ戻る間は、前の案件の内容を描かない（ProjectScope が伏せる）
  return (
    <ProjectScope projectId={projectId}>
      {projectId
        ? <DailyReportBody key={projectId} projectId={projectId} />
        : (
      <div>
        {/* 未選択でも画面の見出しを出す（どの画面にいるか分かるように） */}
        <PageHeader
          breadcrumb={[{ label: '現場日報' }]}
          title="現場日報"
          description="対象案件を選択してください"
          actions={
            <div className="flex items-center gap-2">
              <span className="text-[12px] text-ink-soft">対象案件</span>
              <ProjectSelect projectId={undefined} onChange={setProjectId} />
            </div>
          }
        />
        <Panel><NoProjectSelected what="現場日報" /></Panel>
      </div>
        )}
    </ProjectScope>
  )
}

function DailyReportBody({ projectId }: { projectId: number }) {
  const { toast, confirm } = useApp()
  const { fixedByPath, setProjectId } = useSelectedProject()
  const { data: project } = useProject(projectId)
  const { data: reports = [], isLoading, isError, refetch } = useDailyReports(projectId)
  const { data: taskOpts = [] } = useTaskOptions(projectId)
  const { data: photoOpts = [] } = usePhotos(projectId)
  const saveMut = useSaveDailyReport()
  const statusMut = useChangeDailyReportStatus()
  const copyMut = useCopyDailyReport()
  const createMut = useCreateDailyReport()
  const linksMut = useSetDailyReportLinks()
  const reflectMut = useReflectProgress()
  const [currentId, setCurrentId] = useState('')
  const [draft, setDraft] = useState<DailyReport | null>(null)
  const [reflectPreview, setReflectPreview] = useState<ReflectResult | null>(null)
  const [reflecting, setReflecting] = useState(false)

  // 選択中の日報を編集用 draft へ複製
  useEffect(() => {
    // 読み込み中・エラー時は前の案件の日報を復元しない（draft は null のまま）
    if (isLoading || isError) return
    if (!reports.length) {
      // 日報0件の案件では、前の案件の draft を必ず捨てる
      setCurrentId('')
      setDraft(null)
      return
    }
    const id = reports.some((r) => r.id === currentId) ? currentId : reports[0].id
    if (id !== currentId) setCurrentId(id)
    setDraft({ ...reports.find((r) => r.id === id)! })
  }, [reports, currentId, isLoading, isError])

  const current = draft

  function update<K extends keyof DailyReport>(key: K, value: DailyReport[K]) {
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev))
  }
  function setStatus(status: ReportStatus, msg: string) {
    if (!draft) return
    // まず本文を保存してからステータス遷移
    if (!projectId) return
    saveMut.mutate({ report: draft, projectId }, {
      onSuccess: () => statusMut.mutate({ id: draft.id, status }, {
        onSuccess: () => toast(msg, 'ok'),
        onError: () => toast('ステータス変更に失敗しました', 'ng'),
      }),
      onError: () => toast('保存に失敗しました', 'ng'),
    })
  }
  function saveDraft(msg: string) {
    if (!draft || !projectId) return
    saveMut.mutate({ report: draft, projectId }, {
      onSuccess: () => {
        // 本文と合わせて 写真/工程 紐付けも保存
        linksMut.mutate(
          { id: draft.id, task_ids: draft.taskIds ?? [], photo_ids: draft.photoIds ?? [] },
          { onSuccess: () => toast(msg, 'ok'), onError: () => toast('紐付けの保存に失敗しました', 'ng') },
        )
      },
      onError: () => toast('保存に失敗しました', 'ng'),
    })
  }
  function toggleTask(id: number) {
    setDraft((prev) => {
      if (!prev) return prev
      const cur = prev.taskIds ?? []
      return { ...prev, taskIds: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id] }
    })
  }
  function togglePhoto(id: number) {
    setDraft((prev) => {
      if (!prev) return prev
      const cur = prev.photoIds ?? []
      return { ...prev, photoIds: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id] }
    })
  }
  // 工程実績へ反映：まず dry-run で確認画面を表示、確定時のみ反映
  async function openReflect() {
    if (!draft) return
    if (!(draft.taskIds ?? []).length) { toast('紐付けた工程がありません。実施工程を選択してください', 'warn'); return }
    try {
      const preview = await reflectProgress(draft.id, true)
      setReflectPreview(preview)
    } catch {
      toast('反映内容の取得に失敗しました', 'ng')
    }
  }
  function confirmReflect() {
    if (!draft) return
    setReflecting(true)
    reflectMut.mutate(draft.id, {
      onSuccess: (res) => { setReflecting(false); setReflectPreview(null); toast(`工程実績へ反映しました（${res.total_changes}件の変更）`, 'ok') },
      onError: () => { setReflecting(false); toast('反映に失敗しました', 'ng') },
    })
  }

  // 対象案件の表示は常に画面へ出す。案件配下ルートでは固定表示（変更不可）。
  // 読み込み中・エラー・0件のときも画面の見出しを出す（どの画面にいるか分かるように）。
  const selector = (
    <>
      <PageHeader
        breadcrumb={[{ label: '現場日報' }]}
        title="現場日報"
        description="日々の作業実績・安全・品質の記録"
        actions={
          <>
            <span className="text-[12px] text-ink-soft">対象案件</span>
            {fixedByPath
              ? <FixedProject label={project ? projectLabel(project) : undefined} />
              : <ProjectSelect projectId={projectId} onChange={setProjectId} />}
          </>
        }
      />
    </>
  )
  if (isLoading) return <div>{selector}<div className="rounded border border-line bg-white px-4 py-16 text-center text-[13px] text-ink-soft">日報を読み込んでいます…</div></div>
  if (isError) return <div>{selector}<div className="rounded border border-red-200 bg-red-50 px-4 py-10 text-center text-[13px] text-ng">日報の取得に失敗しました。<button className="ml-2 underline" onClick={() => refetch()}>再試行</button></div></div>
  if (!current) return (
    <div>{selector}
      <div className="rounded border border-line bg-white px-4 py-16 text-center text-[13px] text-ink-soft">
        この案件の日報はまだ登録されていません。
        <button className="ml-2 underline" onClick={() => {
          const today = new Date().toISOString().slice(0, 10)
          createMut.mutate(toUpsertBody({ ...blankReport(), date: today }, projectId), {
            onSuccess: (created) => { setCurrentId(String(created.id)); toast('新規日報を作成しました', 'ok') },
            onError: () => toast('作成に失敗しました', 'ng'),
          })
        }}>新規日報を作成</button>
      </div>
    </div>
  )

  return (
    // どの案件を表示している画面かをDOMにも持たせる（切替時の混在検証に使う）
    <div data-project-scope={projectId}>
      <PageHeader
        breadcrumb={[{ label: '現場日報' }]}
        title="現場日報"
        description="日々の作業実績・安全・品質の記録"
        actions={
          <>
            <span className="text-[12px] text-ink-soft">対象案件</span>
            {fixedByPath
              ? <FixedProject label={project ? projectLabel(project) : undefined} />
              : <ProjectSelect projectId={projectId} onChange={setProjectId} />}
            <button className="btn-default" onClick={() => {
              const prev = reports.filter((r) => r.date < current.date).sort((a, b) => b.date.localeCompare(a.date))[0]
              if (!prev) { toast('前日の日報がありません', 'warn'); return }
              copyMut.mutate(prev.id, {
                onSuccess: (created) => { setCurrentId(String(created.id)); toast('前日の日報をコピーしました', 'ok') },
                onError: () => toast('コピーに失敗しました', 'ng'),
              })
            }}><Copy size={15} />前日をコピー</button>
            <button className="btn-default" onClick={() => toast('この操作は現在準備中です')}><FileText size={15} />PDF表示</button>
            <button className="btn-default" onClick={() => toast('この操作は現在準備中です')}><Printer size={15} />印刷</button>
          </>
        }
      />

      <div className="flex gap-4">
        {/* 左：日報リスト */}
        <div className="w-64 shrink-0">
          <Panel title="日報一覧" bodyClassName="p-0">
            <ul className="divide-y divide-line">
              {reports.map((r) => {
                return (
                  <li key={r.id}>
                    <button onClick={() => setCurrentId(r.id)} data-report-item={r.id}
                      className={`w-full px-3 py-2.5 text-left hover:bg-canvas ${currentId === r.id ? 'bg-sysken-50' : ''}`}>
                      <div className="flex items-center justify-between">
                        <span className="text-[13px] font-medium text-ink">{r.date}</span>
                        <StatusBadge status={r.status} />
                      </div>
                      <p className="mt-0.5 truncate text-xs text-ink-soft">{project?.name ?? ''}</p>
                      <p className="truncate text-[11px] text-slate-400">{r.crew} / {r.manager}</p>
                    </button>
                  </li>
                )
              })}
            </ul>
            <div className="border-t border-line p-2">
              <button className="btn-default w-full justify-center" onClick={() => {
                const today = new Date().toISOString().slice(0, 10)
                if (!projectId) { toast('対象案件を選択してください', 'ng'); return }
                createMut.mutate(toUpsertBody({ ...blankReport(), date: today }, projectId), {
                  onSuccess: (created) => { setCurrentId(String(created.id)); toast('新規日報を作成しました', 'ok') },
                  onError: () => toast('作成に失敗しました', 'ng'),
                })
              }}><Plus size={15} />新規日報</button>
            </div>
          </Panel>
        </div>

        {/* 右：入力フォーム */}
        <div className="min-w-0 flex-1">
          <Panel>
            <div className="mb-3 flex items-center justify-between" data-daily-report={current.id}>
              <div className="flex items-center gap-2">
                <h2 className="text-[15px] font-bold text-ink">{project?.name ?? ''}</h2>
                <StatusBadge status={current.status} />
              </div>
              <span className="text-xs text-ink-soft">作成者：{current.author}</span>
            </div>

            <Section title="基本情報">
              <Grid>
                <Field label="日付"><input type="date" className="field" value={current.date} onChange={(e) => update('date', e.target.value)} /></Field>
                <Field label="天候"><input className="field" value={current.weather} onChange={(e) => update('weather', e.target.value)} /></Field>
                <Field label="気温"><input className="field" value={current.temperature} onChange={(e) => update('temperature', e.target.value)} /></Field>
                <Field label="作業班"><input className="field" value={current.crew} onChange={(e) => update('crew', e.target.value)} /></Field>
                <Field label="現場責任者"><input className="field" value={current.manager} onChange={(e) => update('manager', e.target.value)} /></Field>
                <Field label="作業場所"><input className="field" value={current.place} onChange={(e) => update('place', e.target.value)} /></Field>
                <Field label="作業開始"><input type="time" className="field" value={current.startTime} onChange={(e) => update('startTime', e.target.value)} /></Field>
                <Field label="作業終了"><input type="time" className="field" value={current.endTime} onChange={(e) => update('endTime', e.target.value)} /></Field>
                <Field label="予定/実績人数"><div className="flex items-center gap-1"><input type="number" className="field" value={current.planPeople} onChange={(e) => update('planPeople', Number(e.target.value))} /><span className="text-ink-soft">/</span><input type="number" className="field" value={current.actualPeople} onChange={(e) => update('actualPeople', Number(e.target.value))} /></div></Field>
              </Grid>
            </Section>

            <Section title="作業内容">
              <Grid cols={1}>
                <Field label="作業内容"><textarea className="field h-16 resize-none" value={current.work} onChange={(e) => update('work', e.target.value)} /></Field>
              </Grid>
              <Grid>
                <Field label="実施工程"><input className="field" value={current.process} onChange={(e) => update('process', e.target.value)} /></Field>
                <Field label="使用資材"><input className="field" value={current.materials} onChange={(e) => update('materials', e.target.value)} /></Field>
                <Field label="使用工具"><input className="field" value={current.tools} onChange={(e) => update('tools', e.target.value)} /></Field>
                <Field label="使用車両"><input className="field" value={current.vehicles} onChange={(e) => update('vehicles', e.target.value)} /></Field>
              </Grid>
            </Section>

            <Section title="安全・品質">
              <Grid>
                <Field label="KY活動内容"><input className="field" value={current.kyContent} onChange={(e) => update('kyContent', e.target.value)} /></Field>
                <Field label="危険事項"><input className="field" value={current.hazard} onChange={(e) => update('hazard', e.target.value)} /></Field>
                <Field label="安全確認"><input className="field" value={current.safetyCheck} onChange={(e) => update('safetyCheck', e.target.value)} /></Field>
                <Field label="品質確認"><input className="field" value={current.qualityCheck} onChange={(e) => update('qualityCheck', e.target.value)} /></Field>
              </Grid>
            </Section>

            <Section title="報告・引継ぎ">
              <Grid>
                <Field label="発生した問題"><textarea className="field h-14 resize-none" value={current.problem} onChange={(e) => update('problem', e.target.value)} /></Field>
                <Field label="翌日の予定"><textarea className="field h-14 resize-none" value={current.tomorrow} onChange={(e) => update('tomorrow', e.target.value)} /></Field>
              </Grid>
              <Grid cols={1}>
                <Field label="特記事項"><input className="field" value={current.note} onChange={(e) => update('note', e.target.value)} /></Field>
              </Grid>
            </Section>

            <Section title="実施工程の紐付け">
              <p className="mb-1.5 text-[12px] text-ink-soft">この日報で実施した工程を選択（「工程実績へ反映」の対象になります）</p>
              <div className="thin-scroll max-h-40 space-y-1 overflow-y-auto rounded border border-line p-2">
                {taskOpts.length === 0 && <span className="text-xs text-ink-soft">工程がありません</span>}
                {taskOpts.map((t) => (
                  <label key={t.id} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-[13px] hover:bg-canvas">
                    <input type="checkbox" className="h-4 w-4 accent-sysken-500"
                      checked={(current.taskIds ?? []).includes(t.id)} onChange={() => toggleTask(t.id)} />
                    <span className="tabular-nums text-ink-soft">{t.wbs}</span>
                    <span className="text-ink">{t.name}</span>
                    <span className="ml-auto text-[11px] text-ink-soft">進捗 {t.actual_progress}%</span>
                  </label>
                ))}
              </div>
            </Section>

            <Section title="写真の紐付け">
              <p className="mb-1.5 text-[12px] text-ink-soft">選択中 {(current.photoIds ?? []).length} 枚</p>
              <div className="thin-scroll grid max-h-44 grid-cols-6 gap-2 overflow-y-auto rounded border border-line p-2">
                {photoOpts.length === 0 && <span className="text-xs text-ink-soft">写真がありません</span>}
                {photoOpts.map((p) => {
                  const on = (current.photoIds ?? []).includes(Number(p.id))
                  return (
                    <button key={p.id} type="button" onClick={() => togglePhoto(Number(p.id))}
                      className={`relative overflow-hidden rounded border ${on ? 'border-sysken-500 ring-1 ring-sysken-300' : 'border-line'}`}>
                      <PhotoPlaceholder type={p.colorKey} className="aspect-[4/3] w-full" />
                      {on && <span className="absolute right-0.5 top-0.5 rounded-full bg-sysken-500 p-0.5"><CheckCircle2 size={12} className="text-white" /></span>}
                      <span className="block truncate px-1 py-0.5 text-[10px] tabular-nums text-ink-soft">{p.no}</span>
                    </button>
                  )
                })}
              </div>
            </Section>

            <Section title="承認">
              <Grid>
                <Field label="作成者"><input className="field" value={current.author} onChange={(e) => update('author', e.target.value)} /></Field>
                <Field label="確認者"><input className="field" value={current.checker} onChange={(e) => update('checker', e.target.value)} placeholder="未確認" /></Field>
                <Field label="承認者"><input className="field" value={current.approver} onChange={(e) => update('approver', e.target.value)} placeholder="未承認" /></Field>
              </Grid>
            </Section>
          </Panel>

          {/* 操作バー */}
          <div className="sticky bottom-0 mt-3 flex items-center justify-between rounded border border-line bg-white px-4 py-2.5 shadow-panel">
            <span className="text-xs text-ink-soft">現在のステータス：<StatusBadge status={current.status} /></span>
            <div className="flex items-center gap-2">
              <button className="btn-default" disabled={saveMut.isPending} onClick={() => saveDraft('一時保存しました')}><Save size={15} />{saveMut.isPending ? '保存中…' : '一時保存'}</button>
              <button className="btn-default" onClick={openReflect}><GitBranch size={15} />工程実績へ反映</button>
              <button className="btn-default" onClick={async () => { const ok = await confirm({ title: '差し戻し', message: 'この日報を差し戻しますか？' }); if (ok) setStatus('差し戻し', '差し戻しました') }}><RotateCcw size={15} />差し戻し</button>
              <button className="btn-default" onClick={() => setStatus('承認済み', '承認しました')}><CheckCircle2 size={15} />承認</button>
              <button className="btn-primary" onClick={() => setStatus('提出済み', '日報を提出しました')}><Send size={15} />提出</button>
            </div>
          </div>
        </div>
      </div>

      {/* 工程実績へ反映：確認画面（dry-run 結果を表示、確定時のみ反映） */}
      <Modal open={!!reflectPreview} onClose={() => !reflecting && setReflectPreview(null)} title="工程実績へ反映（確認）" size="lg"
        footer={
          <>
            <button className="btn-default" disabled={reflecting} onClick={() => setReflectPreview(null)}>キャンセル</button>
            <button className="btn-primary" disabled={reflecting || (reflectPreview?.total_changes ?? 0) === 0} onClick={confirmReflect}>
              <CheckCircle2 size={15} />{reflecting ? '反映中…' : 'この内容で反映'}
            </button>
          </>
        }>
        {reflectPreview && (
          <div className="space-y-3">
            <p className="text-[13px] text-ink-soft">
              対象工程 {reflectPreview.reflected_tasks} 件／変更 {reflectPreview.total_changes} 件。確定すると工程実績が更新され、変更履歴（task_change_history）と監査ログに記録されます。
            </p>
            {reflectPreview.total_changes === 0 && (
              <div className="rounded border border-line bg-canvas px-3 py-2 text-[13px] text-ink-soft">反映する変更はありません（既に実績が反映済みです）。</div>
            )}
            <div className="thin-scroll overflow-x-auto">
              <table className="grid-table text-[13px]">
                <thead className="bg-canvas text-[12px] text-ink-soft">
                  <tr>{['工程', '現在進捗', '反映後進捗', '変更内容'].map((h) => <th key={h} className="px-3 py-2 text-left font-semibold">{h}</th>)}</tr>
                </thead>
                <tbody>
                  {reflectPreview.targets.map((t) => (
                    <tr key={t.task_id} className="align-top">
                      <td className="px-3 py-2"><span className="tabular-nums text-ink-soft">{t.wbs_code}</span> {t.task_name}</td>
                      <td className="px-3 py-2 tabular-nums">{t.current_progress}%</td>
                      <td className="px-3 py-2 tabular-nums">{t.progress_after}%</td>
                      <td className="px-3 py-2">
                        {t.changes.length === 0 ? <span className="text-ink-soft">変更なし</span> : (
                          <ul className="space-y-0.5">
                            {t.changes.map((c) => (
                              <li key={c.field} className="text-[12.5px]">
                                {c.label}：<span className="text-ink-soft">{c.from ?? '—'}</span> → <span className="font-medium text-sysken-700">{c.to ?? '—'}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <h3 className="mb-2 border-l-3 border-sysken-500 pl-2 text-[13px] font-semibold text-sysken-700" style={{ borderLeftWidth: 3 }}>{title}</h3>
      {children}
    </div>
  )
}
function Grid({ children, cols = 3 }: { children: React.ReactNode; cols?: number }) {
  return <div className={`grid gap-3 ${cols === 1 ? 'grid-cols-1' : 'grid-cols-3'}`}>{children}</div>
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="label">{label}</label>{children}</div>
}

function blankReport(): DailyReport {
  return {
    id: '', projectId: 'p1', date: '', weather: '', temperature: '', place: '', crew: '', manager: '',
    startTime: '', endTime: '', planPeople: 0, actualPeople: 0, work: '', process: '', materials: '',
    tools: '', vehicles: '', kyContent: '', hazard: '', safetyCheck: '', qualityCheck: '', problem: '',
    tomorrow: '', note: '', author: '', checker: '', approver: '', status: '下書き',
  }
}
