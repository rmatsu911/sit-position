import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Search, Plus, FileDown, Columns3, RotateCcw, ChevronDown } from 'lucide-react'
import { PageHeader } from '../components/layout/Breadcrumb'
import { Panel } from '../components/ui/common'
import { StatusBadge } from '../components/ui/Badge'
import { Progress } from '../components/ui/Progress'
import { Modal } from '../components/ui/Modal'
import { useApp } from '../context/AppContext'
import { projects } from '../data/projects'
import type { ProjectStatus } from '../types'

const statuses: ProjectStatus[] = ['未着工', '準備中', '施工中', '確認待ち', '一時停止', '遅延', '完了', '中止']
const areas = ['すべて', '熊本市中央区', '八代市', '菊池郡菊陽町', '合志市', '玉名市', '熊本市東区', '天草市', '阿蘇市']
const depts = ['すべて', '施工管理部 第一課', '施工管理部 第二課', '施工管理部 第三課']

export default function Projects() {
  const { toast } = useApp()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [keyword, setKeyword] = useState('')
  const [status, setStatus] = useState<string>(params.get('status') ?? 'all')
  const [area, setArea] = useState('すべて')
  const [dept, setDept] = useState('すべて')
  const [onlyDelayed, setOnlyDelayed] = useState(false)
  const [sortKey, setSortKey] = useState<'code' | 'progressActual' | 'dueDate'>('code')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [newOpen, setNewOpen] = useState(false)
  const [page, setPage] = useState(1)
  const perPage = 8

  const filtered = useMemo(() => {
    const r = projects.filter((p) => {
      if (keyword && !(`${p.name}${p.code}${p.client}${p.manager}`.includes(keyword))) return false
      if (status !== 'all' && p.status !== status) return false
      if (area !== 'すべて' && p.area !== area) return false
      if (dept !== 'すべて' && p.department !== dept) return false
      if (onlyDelayed && !p.delayed) return false
      return true
    })
    r.sort((a, b) => {
      if (sortKey === 'progressActual') return b.progressActual - a.progressActual
      if (sortKey === 'dueDate') return a.dueDate.localeCompare(b.dueDate)
      return a.code.localeCompare(b.code)
    })
    return r
  }, [keyword, status, area, dept, onlyDelayed, sortKey])

  const pageItems = filtered.slice((page - 1) * perPage, page * perPage)
  const pages = Math.max(1, Math.ceil(filtered.length / perPage))

  function reset() {
    setKeyword(''); setStatus('all'); setArea('すべて'); setDept('すべて'); setOnlyDelayed(false); setPage(1)
  }
  function toggleAll() {
    if (selected.size === pageItems.length) setSelected(new Set())
    else setSelected(new Set(pageItems.map((p) => p.id)))
  }

  return (
    <div>
      <PageHeader
        breadcrumb={[{ label: '案件一覧' }]}
        title="案件一覧"
        description={`全 ${projects.length} 件 ／ 検索結果 ${filtered.length} 件`}
        actions={
          <>
            <button className="btn-default" onClick={() => toast('表示列設定を開きます（デモ）')}><Columns3 size={15} />表示列設定</button>
            <button className="btn-default" onClick={() => toast('CSVを出力しました（デモ）', 'ok')}><FileDown size={15} />CSV出力</button>
            <button className="btn-primary" onClick={() => setNewOpen(true)}><Plus size={15} />新規案件登録</button>
          </>
        }
      />

      {/* 検索条件 */}
      <Panel className="mb-3">
        <div className="grid grid-cols-4 gap-3">
          <div className="col-span-2">
            <label className="label">フリーワード（工事名・案件番号・顧客・責任者）</label>
            <div className="relative">
              <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-soft" />
              <input className="field pl-8" value={keyword} onChange={(e) => { setKeyword(e.target.value); setPage(1) }} placeholder="キーワードを入力" />
            </div>
          </div>
          <div><label className="label">ステータス</label>
            <select className="field" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }}>
              <option value="all">すべて</option>
              {statuses.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div><label className="label">エリア</label>
            <select className="field" value={area} onChange={(e) => { setArea(e.target.value); setPage(1) }}>{areas.map((a) => <option key={a}>{a}</option>)}</select>
          </div>
          <div><label className="label">担当部署</label>
            <select className="field" value={dept} onChange={(e) => { setDept(e.target.value); setPage(1) }}>{depts.map((d) => <option key={d}>{d}</option>)}</select>
          </div>
          <div><label className="label">並び替え</label>
            <select className="field" value={sortKey} onChange={(e) => setSortKey(e.target.value as typeof sortKey)}>
              <option value="code">案件番号順</option>
              <option value="progressActual">進捗率順</option>
              <option value="dueDate">完了予定日順</option>
            </select>
          </div>
          <div className="flex items-end gap-4">
            <label className="flex items-center gap-1.5 text-[13px] text-ink"><input type="checkbox" className="h-4 w-4 accent-sysken-500" checked={onlyDelayed} onChange={(e) => { setOnlyDelayed(e.target.checked); setPage(1) }} />遅延案件のみ</label>
          </div>
          <div className="col-span-2 flex items-end justify-end gap-2">
            <button className="btn-default" onClick={reset}><RotateCcw size={15} />条件クリア</button>
            <button className="btn-primary" onClick={() => toast(`${filtered.length}件を検索しました`, 'info')}><Search size={15} />検索</button>
          </div>
        </div>
      </Panel>

      {/* 一括操作バー */}
      {selected.size > 0 && (
        <div className="mb-2 flex items-center gap-3 rounded border border-sysken-200 bg-sysken-50 px-3 py-2 text-[13px]">
          <span className="font-medium text-sysken-700">{selected.size}件を選択中</span>
          <button className="btn-default btn-xs" onClick={() => toast('一括でステータスを変更しました（デモ）', 'ok')}>ステータス変更</button>
          <button className="btn-default btn-xs" onClick={() => toast('一括で担当を変更しました（デモ）', 'ok')}>担当変更</button>
          <button className="btn-default btn-xs" onClick={() => toast('選択案件をCSV出力しました（デモ）', 'ok')}>CSV出力</button>
          <button className="ml-auto text-xs text-ink-soft hover:underline" onClick={() => setSelected(new Set())}>選択解除</button>
        </div>
      )}

      {/* 一覧 */}
      <Panel bodyClassName="p-0" className="overflow-hidden">
        <div className="thin-scroll overflow-x-auto">
          <table className="grid-table text-[13px]">
            <thead className="bg-canvas text-xs text-ink-soft">
              <tr>
                <th className="px-3 py-2"><input type="checkbox" className="h-4 w-4 accent-sysken-500" checked={selected.size === pageItems.length && pageItems.length > 0} onChange={toggleAll} /></th>
                {['案件番号', '工事名', '顧客', 'エリア', '担当部署', '現場責任者', '開始日', '完了予定', '進捗率', 'ステータス', '写真未確認', '品質確認'].map((h) => <th key={h} className="px-3 py-2 text-left font-semibold">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {pageItems.map((p) => (
                <tr key={p.id} className={`hover:bg-canvas ${selected.has(p.id) ? 'bg-sysken-50' : ''}`}>
                  <td className="px-3"><input type="checkbox" className="h-4 w-4 accent-sysken-500" checked={selected.has(p.id)} onChange={() => setSelected((s) => { const n = new Set(s); n.has(p.id) ? n.delete(p.id) : n.add(p.id); return n })} /></td>
                  <td className="cursor-pointer px-3 tabular-nums text-sysken-600" onClick={() => navigate(`/projects/${p.id}`)}>{p.code}</td>
                  <td className="cursor-pointer px-3 font-medium text-ink hover:text-sysken-600" onClick={() => navigate(`/projects/${p.id}`)}>{p.name}</td>
                  <td className="px-3 text-ink-soft">{p.client}</td>
                  <td className="px-3 text-ink-soft">{p.area}</td>
                  <td className="px-3 text-ink-soft">{p.department}</td>
                  <td className="px-3 text-ink-soft">{p.manager}</td>
                  <td className="px-3 tabular-nums text-ink-soft">{p.startDate.slice(5)}</td>
                  <td className="px-3 tabular-nums text-ink-soft">{p.dueDate.slice(5)}</td>
                  <td className="w-28 px-3"><Progress value={p.progressActual} plan={p.progressPlan} height={7} /></td>
                  <td className="px-3"><StatusBadge status={p.status} /></td>
                  <td className="px-3 text-center tabular-nums">{p.unconfirmedPhotos}</td>
                  <td className="px-3 text-center tabular-nums">{p.qualityChecks}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* ページネーション */}
        <div className="flex items-center justify-between border-t border-line px-3 py-2 text-xs text-ink-soft">
          <span>{filtered.length}件中 {(page - 1) * perPage + 1}〜{Math.min(page * perPage, filtered.length)}件を表示</span>
          <div className="flex items-center gap-1">
            <button className="btn-default btn-xs disabled:opacity-40" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>前へ</button>
            {Array.from({ length: pages }).map((_, i) => (
              <button key={i} onClick={() => setPage(i + 1)} className={`h-7 w-7 rounded text-xs ${page === i + 1 ? 'bg-sysken-500 text-white' : 'border border-line hover:bg-canvas'}`}>{i + 1}</button>
            ))}
            <button className="btn-default btn-xs disabled:opacity-40" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>次へ</button>
          </div>
        </div>
      </Panel>

      <NewProjectModal open={newOpen} onClose={() => setNewOpen(false)} onSubmit={() => { setNewOpen(false); toast('案件を登録しました', 'ok') }} />
    </div>
  )
}

function NewProjectModal({ open, onClose, onSubmit }: { open: boolean; onClose: () => void; onSubmit: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="新規案件登録" size="lg"
      footer={<><button className="btn-default" onClick={onClose}>キャンセル</button><button className="btn-primary" onClick={onSubmit}>案件を登録</button></>}>
      <div className="grid grid-cols-2 gap-3">
        <F label="工事名" span2><input className="field" placeholder="例：○○局 光設備更改工事" /></F>
        <F label="顧客"><select className="field"><option>西日本通信ネットワーク</option><option>肥後ブロードバンド</option><option>九州モバイル通信</option><option>自治体</option></select></F>
        <F label="工事区分"><select className="field"><option>局内設備更改</option><option>FTTH増設</option><option>地中管路敷設</option><option>基地局設備更新</option><option>切替工事</option></select></F>
        <F label="エリア"><input className="field" placeholder="例：熊本市中央区" /></F>
        <F label="工事場所"><input className="field" placeholder="住所・局舎名" /></F>
        <F label="担当部署"><select className="field"><option>施工管理部 第一課</option><option>施工管理部 第二課</option><option>施工管理部 第三課</option></select></F>
        <F label="現場責任者"><select className="field"><option>山田 太郎</option><option>佐藤 花子</option><option>田中 一郎</option><option>高橋 誠</option></select></F>
        <F label="開始日"><input type="date" className="field" defaultValue="2026-08-01" /></F>
        <F label="完了予定日"><input type="date" className="field" defaultValue="2026-11-30" /></F>
        <F label="予定予算（円）"><input type="number" className="field" placeholder="例：24000000" /></F>
        <F label="優先度"><div className="flex items-center gap-3 pt-1 text-[13px]"><label className="flex items-center gap-1"><input type="radio" name="pri" defaultChecked className="accent-sysken-500" />高</label><label className="flex items-center gap-1"><input type="radio" name="pri" className="accent-sysken-500" />中</label><label className="flex items-center gap-1"><input type="radio" name="pri" className="accent-sysken-500" />低</label></div></F>
        <F label="備考" span2><textarea className="field h-16 resize-none" placeholder="特記事項があれば入力" /></F>
      </div>
    </Modal>
  )
}

function F({ label, children, span2 }: { label: string; children: React.ReactNode; span2?: boolean }) {
  return <div className={span2 ? 'col-span-2' : ''}><label className="label flex items-center gap-1">{label}<ChevronDown size={0} /></label>{children}</div>
}
