import { useMemo, useState } from 'react'
import { Search, AlertTriangle, UserCheck } from 'lucide-react'
import { PageHeader } from '../components/layout/Breadcrumb'
import { Panel } from '../components/ui/common'
import { StatusBadge, Badge } from '../components/ui/Badge'
import { useApp } from '../context/AppContext'
import { useWorkers, useAssignWorker } from '../api/personnel'
import { useProjects } from '../api/projects'
import { IS_DEV_VISIBLE } from '../lib/env'
import type { Worker, WorkStatus } from '../types'

// 勤務予定（勤怠）は専用テーブル未整備のため、開発環境の確認用サンプルとしてのみ表示する。
const scheduleDates = ['1日目', '2日目', '3日目', '4日目', '5日目', '6日目', '7日目']
const allLicenses = ['高所作業車', '酸素欠乏危険作業', '職長・安全衛生責任者', '光ファイバ融着', '電気工事士', '玉掛け', '小型移動式クレーン', '低圧電気取扱', 'フルハーネス特別教育', '交通誘導']

const cellColor: Record<WorkStatus, string> = {
  稼働: 'bg-sysken-100 text-sysken-700',
  待機: 'bg-slate-100 text-slate-500',
  休暇: 'bg-amber-50 text-warn',
  移動中: 'bg-emerald-50 text-ok',
}

export default function Personnel() {
  const { toast } = useApp()
  const { data: workers = [], isLoading, isError } = useWorkers()
  const { data: projectList = [] } = useProjects()
  const assignMut = useAssignWorker()
  const nameToId = useMemo(() => new Map(projectList.map((p) => [p.name, p.id])), [projectList])
  function persistAssign(workerId: string, projName: string) {
    const pid = nameToId.get(projName)
    if (!pid) { toast('案件が見つかりません', 'ng'); return }
    assignMut.mutate({ worker_id: workerId, project_id: pid }, {
      onSuccess: () => toast('配置を保存しました', 'ok'),
      onError: () => toast('配置の保存に失敗しました', 'ng'),
    })
  }
  const [view, setView] = useState<'week' | 'assign'>('week')
  const [keyword, setKeyword] = useState('')
  const [license, setLicense] = useState('all')
  const [onlyIdle, setOnlyIdle] = useState(false)
  const [dragId, setDragId] = useState<string | null>(null)

  const filtered = useMemo(() => workers.filter((w) => {
    if (keyword && !`${w.name}${w.org}${w.crew}`.includes(keyword)) return false
    if (license !== 'all' && !w.licenses.includes(license)) return false
    if (onlyIdle && w.status !== '待機') return false
    return true
  }), [workers, keyword, license, onlyIdle])

  const warnings = workers.filter((w) => w.continuousDays >= 7 || w.note.includes('重複'))

  return (
    <div>
      <PageHeader
        breadcrumb={[{ label: '要員管理' }]}
        title="要員管理"
        description={`稼働 ${workers.filter((w) => w.status === '稼働').length}名 ／ 待機 ${workers.filter((w) => w.status === '待機').length}名 ／ 休暇 ${workers.filter((w) => w.status === '休暇').length}名`}
        actions={
          <div className="flex items-center gap-0.5 rounded border border-line p-0.5">
            {(['week', 'assign'] as const).map((v) => (
              <button key={v} onClick={() => setView(v)} className={`rounded px-2.5 py-1 text-xs font-medium ${view === v ? 'bg-sysken-500 text-white' : 'text-ink hover:bg-canvas'}`}>{v === 'week' ? '週別勤務' : '案件配置'}</button>
            ))}
          </div>
        }
      />

      {/* 警告 */}
      {warnings.length > 0 && (
        <div className="mb-3 flex items-center gap-2 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-warn">
          <AlertTriangle size={16} />
          <span className="font-medium">要員アラート：</span>
          {warnings.map((w) => <Badge key={w.id} tone="warn">{w.name}：{w.continuousDays >= 7 ? '連続7日勤務' : '重複配置の可能性'}</Badge>)}
        </div>
      )}

      {/* 検索 */}
      <Panel className="mb-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-64"><label className="label">氏名・所属・班で検索</label>
            <div className="relative"><Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-soft" /><input className="field pl-8" value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="キーワード" /></div>
          </div>
          <div className="w-56"><label className="label">保有資格</label>
            <select className="field" value={license} onChange={(e) => setLicense(e.target.value)}><option value="all">すべて</option>{allLicenses.map((l) => <option key={l}>{l}</option>)}</select>
          </div>
          <label className="flex items-center gap-1.5 pb-2 text-[13px]"><input type="checkbox" className="h-4 w-4 accent-sysken-500" checked={onlyIdle} onChange={(e) => setOnlyIdle(e.target.checked)} />空き要員のみ</label>
          <button className="btn-default mb-0.5" onClick={() => toast(`${filtered.length}名を検索しました`)}><Search size={15} />検索</button>
        </div>
      </Panel>

      {view === 'week' ? (
        <>
          <div className="mb-2 rounded border border-line bg-white px-3 py-2 text-[12.5px] text-ink-soft">
            勤務予定（勤怠）管理は未連携です。以下は要員台帳に登録された情報を表示しています。
            {IS_DEV_VISIBLE && '（右側の日別列は開発環境の確認用サンプルです）'}
          </div>
          <Panel bodyClassName="p-0" className="overflow-hidden">
            <div className="thin-scroll overflow-x-auto">
              <table className="grid-table text-[13px]">
                <thead className="bg-canvas text-[12.5px] text-ink-soft">
                  <tr>
                    {['氏名', '所属', '班', '役割', '保有資格', '現在の配置先', '稼働状況', '連続勤務', '休暇'].map((h) => <th key={h} className="px-3 py-2 text-left font-semibold">{h}</th>)}
                    {IS_DEV_VISIBLE && scheduleDates.map((d) => <th key={d} className="px-2 py-2 text-center font-semibold">{d}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {isLoading && <tr><td colSpan={IS_DEV_VISIBLE ? 16 : 9} className="px-3 py-8 text-center text-ink-soft">要員を読み込んでいます…</td></tr>}
                  {isError && <tr><td colSpan={IS_DEV_VISIBLE ? 16 : 9} className="px-3 py-8 text-center text-ng">要員の取得に失敗しました。</td></tr>}
                  {!isLoading && !isError && filtered.length === 0 && <tr><td colSpan={IS_DEV_VISIBLE ? 16 : 9} className="px-3 py-8 text-center text-ink-soft">該当する要員がいません。</td></tr>}
                  {filtered.map((w) => (
                    <tr key={w.id} className="hover:bg-canvas">
                      <td className="px-3 py-1.5 font-medium text-ink">{w.name}</td>
                      <td className="px-3 text-ink-soft">{w.org}</td>
                      <td className="px-3 text-ink-soft">{w.crew}</td>
                      <td className="px-3 text-ink-soft">{w.role}</td>
                      <td className="px-3"><div className="flex flex-wrap gap-1">{w.licenses.slice(0, 2).map((l) => <Badge key={l} tone="muted">{l}</Badge>)}{w.licenses.length > 2 && <Badge tone="muted">+{w.licenses.length - 2}</Badge>}</div></td>
                      <td className="max-w-[180px] truncate px-3 text-ink-soft">{w.assignedTo}</td>
                      <td className="px-3"><StatusBadge status={w.status} /></td>
                      <td className="px-3 text-center tabular-nums"><span className={w.continuousDays >= 7 ? 'font-bold text-ng' : ''}>{w.continuousDays}日</span></td>
                      <td className="px-3 text-ink-soft">{w.vacation}</td>
                      {IS_DEV_VISIBLE && w.schedule.map((s, i) => <td key={i} className="px-1 py-1 text-center"><span className={`inline-block w-full rounded px-1 py-0.5 text-[11px] ${cellColor[s]}`}>{s}</span></td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </>
      ) : (
        <AssignBoard workers={workers} projects={projectList.map((p) => p.name)} dragId={dragId} setDragId={setDragId} onAssign={persistAssign} />
      )}
    </div>
  )
}

function AssignBoard({ workers, projects, dragId, setDragId, onAssign }: { workers: Worker[]; projects: string[]; dragId: string | null; setDragId: (v: string | null) => void; onAssign: (workerId: string, proj: string) => void }) {
  const idle = workers.filter((w) => w.status === '待機')
  const cols = projects.slice(0, 3)
  return (
    <div className="grid grid-cols-4 gap-3">
      <Panel title="空き要員（ドラッグで配置）" bodyClassName="p-2">
        <div className="space-y-2">
          {idle.map((w) => (
            <div key={w.id} draggable onDragStart={() => setDragId(w.id)} onDragEnd={() => setDragId(null)}
              className="cursor-grab rounded border border-line bg-white p-2 text-[13px] shadow-panel active:cursor-grabbing">
              <div className="flex items-center gap-1.5"><UserCheck size={15} className="text-ok" /><span className="font-medium">{w.name}</span></div>
              <p className="mt-0.5 text-[11px] text-ink-soft">{w.org} / {w.role}</p>
              <div className="mt-1 flex flex-wrap gap-1">{w.licenses.slice(0, 2).map((l) => <Badge key={l} tone="muted">{l}</Badge>)}</div>
            </div>
          ))}
          {idle.length === 0 && <p className="p-2 text-xs text-ink-soft">空き要員はいません</p>}
        </div>
      </Panel>
      {cols.length === 0 && <p className="col-span-3 p-4 text-center text-[13px] text-ink-soft">配置先の案件がありません。</p>}
      {cols.map((proj) => {
        const assigned = workers.filter((w) => w.assignedTo === proj)
        return (
          <Panel key={proj} title={proj.length > 12 ? proj.slice(0, 12) + '…' : proj} bodyClassName="p-2">
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (!dragId) return
                const w = workers.find((x) => x.id === dragId)!
                onAssign(w.id, proj)
                setDragId(null)
              }}
              className="min-h-[180px] space-y-2 rounded border border-dashed border-line bg-canvas p-2"
            >
              {assigned.map((w) => (
                <div key={w.id} className="rounded border border-line bg-white p-1.5 text-[13px]"><span className="font-medium">{w.name}</span><span className="ml-1 text-[11px] text-ink-soft">{w.role}</span></div>
              ))}
              <p className="pt-1 text-center text-[11px] text-slate-400">ここにドロップして配置</p>
            </div>
          </Panel>
        )
      })}
    </div>
  )
}
