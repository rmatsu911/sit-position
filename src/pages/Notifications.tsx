import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Camera, ShieldCheck, Clock, ClipboardList, CheckSquare, RotateCcw, FileBox,
  UserCog, BadgeAlert, Users, CalendarClock, CloudLightning, Thermometer, CheckCheck, Star,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { PageHeader } from '../components/layout/Breadcrumb'
import { Panel } from '../components/ui/common'
import { Badge } from '../components/ui/Badge'
import { useApp } from '../context/AppContext'
import { notifications as seed } from '../data/notifications'
import type { NotifyKind } from '../types'

const kindIcon: Record<NotifyKind, LucideIcon> = {
  写真未提出: Camera, 品質確認待ち: ShieldCheck, 工程遅延: Clock, 日報未提出: ClipboardList,
  承認依頼: CheckSquare, 再撮影依頼: RotateCcw, 図面更新: FileBox, 担当者変更: UserCog,
  資格期限接近: BadgeAlert, 要員重複: Users, 提出期限接近: CalendarClock, 天候注意: CloudLightning, 熱中症注意: Thermometer,
}

const kinds = Object.keys(kindIcon) as NotifyKind[]

export default function Notifications() {
  const { toast } = useApp()
  const navigate = useNavigate()
  const [items, setItems] = useState(() => seed.map((n) => ({ ...n })))
  const [kindFilter, setKindFilter] = useState<string>('all')
  const [projectFilter, setProjectFilter] = useState<string>('all')
  const [onlyUnread, setOnlyUnread] = useState(false)

  const projectsInNotif = useMemo(() => Array.from(new Set(seed.map((n) => n.project))).filter((p) => p !== '—'), [])

  const filtered = useMemo(() => items.filter((n) => {
    if (kindFilter !== 'all' && n.kind !== kindFilter) return false
    if (projectFilter !== 'all' && n.project !== projectFilter) return false
    if (onlyUnread && n.read) return false
    return true
  }), [items, kindFilter, projectFilter, onlyUnread])

  // 日付グループ
  const groups = useMemo(() => {
    const m = new Map<string, typeof filtered>()
    filtered.forEach((n) => {
      const d = n.at.slice(0, 10)
      if (!m.has(d)) m.set(d, [])
      m.get(d)!.push(n)
    })
    return Array.from(m.entries()).sort((a, b) => b[0].localeCompare(a[0]))
  }, [filtered])

  function read(id: string) {
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)))
  }
  function markAll() {
    setItems((prev) => prev.map((n) => ({ ...n, read: true })))
    toast('すべて既読にしました', 'ok')
  }
  const unread = items.filter((n) => !n.read).length

  return (
    <div>
      <PageHeader
        breadcrumb={[{ label: '通知' }]}
        title="通知"
        description={`未読 ${unread} 件 ／ 全 ${items.length} 件`}
        actions={<button className="btn-default" onClick={markAll}><CheckCheck size={15} />すべて既読</button>}
      />
      <div className="flex gap-4">
        {/* 左：フィルタ */}
        <div className="w-56 shrink-0 space-y-3">
          <Panel title="フィルター">
            <label className="label">通知種別</label>
            <select className="field mb-3" value={kindFilter} onChange={(e) => setKindFilter(e.target.value)}>
              <option value="all">すべて</option>
              {kinds.map((k) => <option key={k}>{k}</option>)}
            </select>
            <label className="label">案件</label>
            <select className="field mb-3" value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)}>
              <option value="all">すべて</option>
              {projectsInNotif.map((p) => <option key={p}>{p}</option>)}
            </select>
            <label className="flex items-center gap-1.5 text-[13px]"><input type="checkbox" className="h-4 w-4 accent-sysken-500" checked={onlyUnread} onChange={(e) => setOnlyUnread(e.target.checked)} />未読のみ表示</label>
          </Panel>
        </div>

        {/* 右：タイムライン */}
        <div className="min-w-0 flex-1 space-y-4">
          {groups.map(([date, list]) => (
            <div key={date}>
              <div className="mb-2 flex items-center gap-2">
                <h3 className="text-[13px] font-semibold text-ink-soft">{date}</h3>
                <div className="h-px flex-1 bg-line" />
              </div>
              <div className="space-y-2">
                {list.map((n) => {
                  const Icon = kindIcon[n.kind]
                  return (
                    <div key={n.id} onClick={() => { read(n.id); navigate(n.link) }}
                      className={`flex cursor-pointer items-start gap-3 rounded border bg-white px-4 py-3 shadow-panel transition-colors hover:border-sysken-300 ${n.read ? 'border-line' : 'border-l-4 border-l-sysken-500'}`}>
                      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded ${n.important ? 'bg-red-50 text-ng' : 'bg-sysken-50 text-sysken-600'}`}><Icon size={18} /></div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <Badge tone={n.important ? 'ng' : 'info'}>{n.kind}</Badge>
                          {!n.read && <span className="h-1.5 w-1.5 rounded-full bg-sysken-500" />}
                          {n.important && <Star size={13} className="fill-warn text-warn" />}
                          <span className="ml-auto text-[11px] tabular-nums text-slate-400">{n.at.slice(11)}</span>
                        </div>
                        <p className="mt-1 text-[13px] font-medium text-ink">{n.title}</p>
                        <p className="text-xs text-ink-soft">{n.body}</p>
                        {n.project !== '—' && <p className="mt-0.5 text-[11px] text-slate-400">案件：{n.project}</p>}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
          {filtered.length === 0 && <Panel><p className="py-8 text-center text-sm text-ink-soft">該当する通知はありません</p></Panel>}
        </div>
      </div>
    </div>
  )
}
