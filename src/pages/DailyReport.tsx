import { useMemo, useState } from 'react'
import { Save, Send, RotateCcw, CheckCircle2, Copy, FileText, Printer, Paperclip, Plus } from 'lucide-react'
import { PageHeader } from '../components/layout/Breadcrumb'
import { Panel } from '../components/ui/common'
import { StatusBadge } from '../components/ui/Badge'
import { PhotoPlaceholder } from '../components/ui/PhotoPlaceholder'
import { useApp } from '../context/AppContext'
import { dailyReports as seed } from '../data/dailyReports'
import { projectById } from '../data/projects'
import type { DailyReport, ReportStatus } from '../types'

export default function DailyReportPage() {
  const { toast, confirm } = useApp()
  const [reports, setReports] = useState<DailyReport[]>(() => seed.map((r) => ({ ...r })))
  const [currentId, setCurrentId] = useState('dr1')
  const [attached, setAttached] = useState(0)

  const current = useMemo(() => reports.find((r) => r.id === currentId)!, [reports, currentId])

  function update<K extends keyof DailyReport>(key: K, value: DailyReport[K]) {
    setReports((prev) => prev.map((r) => (r.id === currentId ? { ...r, [key]: value } : r)))
  }
  function setStatus(status: ReportStatus, msg: string) {
    update('status', status)
    toast(msg, 'ok')
  }

  return (
    <div>
      <PageHeader
        breadcrumb={[{ label: '現場日報' }]}
        title="現場日報"
        description="日々の作業実績・安全・品質の記録"
        actions={
          <>
            <button className="btn-default" onClick={() => { const src = reports.find((r) => r.id === 'dr2')!; update('work', src.work); update('process', src.process); toast('前日の日報をコピーしました', 'ok') }}><Copy size={15} />前日をコピー</button>
            <button className="btn-default" onClick={() => toast('PDFを表示します（デモ）')}><FileText size={15} />PDF表示</button>
            <button className="btn-default" onClick={() => toast('印刷ダイアログを開きます（デモ）')}><Printer size={15} />印刷</button>
          </>
        }
      />

      <div className="flex gap-4">
        {/* 左：日報リスト */}
        <div className="w-64 shrink-0">
          <Panel title="日報一覧" bodyClassName="p-0">
            <ul className="divide-y divide-line">
              {reports.map((r) => {
                const p = projectById(r.projectId)
                return (
                  <li key={r.id}>
                    <button onClick={() => setCurrentId(r.id)} className={`w-full px-3 py-2.5 text-left hover:bg-canvas ${currentId === r.id ? 'bg-sysken-50' : ''}`}>
                      <div className="flex items-center justify-between">
                        <span className="text-[13px] font-medium text-ink">{r.date}</span>
                        <StatusBadge status={r.status} />
                      </div>
                      <p className="mt-0.5 truncate text-xs text-ink-soft">{p?.name}</p>
                      <p className="truncate text-[11px] text-slate-400">{r.crew} / {r.manager}</p>
                    </button>
                  </li>
                )
              })}
            </ul>
            <div className="border-t border-line p-2">
              <button className="btn-default w-full justify-center" onClick={() => toast('新規日報を作成します（デモ）')}><Plus size={15} />新規日報</button>
            </div>
          </Panel>
        </div>

        {/* 右：入力フォーム */}
        <div className="min-w-0 flex-1">
          <Panel>
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h2 className="text-[15px] font-bold text-ink">{projectById(current.projectId)?.name}</h2>
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

            <Section title="写真添付">
              <div className="flex items-center gap-2">
                <button className="btn-default" onClick={() => { setAttached((v) => v + 1); toast('写真を添付しました（デモ）', 'ok') }}><Paperclip size={15} />写真を添付</button>
                <div className="flex gap-2">
                  {Array.from({ length: attached }).map((_, i) => (
                    <div key={i} className="h-12 w-16 overflow-hidden rounded border border-line"><PhotoPlaceholder type={['融着', 'クロージャ', 'ONU'][i % 3]} className="h-full w-full" /></div>
                  ))}
                  {attached === 0 && <span className="text-xs text-ink-soft">添付写真はありません</span>}
                </div>
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
              <button className="btn-default" onClick={() => setStatus('下書き', '一時保存しました')}><Save size={15} />一時保存</button>
              <button className="btn-default" onClick={async () => { const ok = await confirm({ title: '差し戻し', message: 'この日報を差し戻しますか？' }); if (ok) setStatus('差し戻し', '差し戻しました') }}><RotateCcw size={15} />差し戻し</button>
              <button className="btn-default" onClick={() => setStatus('承認済み', '承認しました')}><CheckCircle2 size={15} />承認</button>
              <button className="btn-primary" onClick={() => setStatus('提出済み', '日報を提出しました')}><Send size={15} />提出</button>
            </div>
          </div>
        </div>
      </div>
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
