import { Mail } from 'lucide-react'
import { Card } from '../components/ui'
import { members } from '../data/mockData'
import type { Member } from '../types'

const statusStyles: Record<Member['status'], string> = {
  稼働中: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  離席中: 'bg-amber-50 text-amber-700 border-amber-200',
  休暇中: 'bg-slate-100 text-slate-600 border-slate-200',
}

function initials(name: string): string {
  return name.replace(/\s/g, '').charAt(0)
}

export default function Members() {
  return (
    <div className="grid grid-cols-4 gap-5">
      {members.map((m) => (
        <Card key={m.id} className="!p-0">
          <div className="flex flex-col items-center px-5 py-6 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-500 text-2xl font-bold text-white">
              {initials(m.name)}
            </div>
            <p className="mt-3 text-base font-semibold text-slate-800">{m.name}</p>
            <p className="text-xs text-slate-400">
              {m.department} / {m.role}
            </p>
            <span
              className={`mt-3 inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${statusStyles[m.status]}`}
            >
              {m.status}
            </span>
          </div>
          <div className="border-t border-slate-100 px-5 py-3">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <Mail size={14} />
              <span className="truncate">{m.email}</span>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              対応中タスク: <span className="font-semibold text-slate-700">{m.activeTasks}件</span>
            </p>
          </div>
        </Card>
      ))}
    </div>
  )
}
