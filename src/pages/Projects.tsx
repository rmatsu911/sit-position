import { useMemo, useState } from 'react'
import { Plus, Filter } from 'lucide-react'
import { Card, PriorityBadge, ProgressBar, StatusBadge } from '../components/ui'
import { projects } from '../data/mockData'
import type { ProjectStatus } from '../types'
import { formatDate, formatManYen } from '../lib/format'

const filters: (ProjectStatus | 'すべて')[] = [
  'すべて',
  '進行中',
  '未着手',
  '保留',
  '完了',
]

export default function Projects() {
  const [active, setActive] = useState<(typeof filters)[number]>('すべて')

  const filtered = useMemo(
    () =>
      active === 'すべて'
        ? projects
        : projects.filter((p) => p.status === active),
    [active],
  )

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Filter size={16} className="text-slate-400" />
          {filters.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setActive(f)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                active === f
                  ? 'bg-brand-500 text-white'
                  : 'bg-white text-slate-600 hover:bg-slate-100'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="flex items-center gap-1.5 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600"
        >
          <Plus size={16} />
          新規案件
        </button>
      </div>

      <Card className="!p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
              <th className="px-5 py-3">案件ID</th>
              <th className="px-5 py-3">案件名</th>
              <th className="px-5 py-3">顧客</th>
              <th className="px-5 py-3">担当</th>
              <th className="px-5 py-3">ステータス</th>
              <th className="px-5 py-3">優先度</th>
              <th className="w-52 px-5 py-3">進捗</th>
              <th className="px-5 py-3 text-right">予算</th>
              <th className="px-5 py-3">納期</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {filtered.map((p) => (
              <tr key={p.id} className="hover:bg-slate-50">
                <td className="px-5 py-3 font-mono text-xs text-slate-400">{p.id}</td>
                <td className="px-5 py-3 font-medium text-slate-700">{p.name}</td>
                <td className="px-5 py-3 text-slate-600">{p.client}</td>
                <td className="px-5 py-3 text-slate-600">{p.owner}</td>
                <td className="px-5 py-3"><StatusBadge status={p.status} /></td>
                <td className="px-5 py-3"><PriorityBadge priority={p.priority} /></td>
                <td className="px-5 py-3"><ProgressBar value={p.progress} /></td>
                <td className="px-5 py-3 text-right tabular-nums text-slate-600">{formatManYen(p.budget)}</td>
                <td className="px-5 py-3 text-slate-600">{formatDate(p.dueDate, 'M/d')}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <p className="px-5 py-10 text-center text-sm text-slate-400">
            該当する案件はありません。
          </p>
        )}
      </Card>
    </div>
  )
}
