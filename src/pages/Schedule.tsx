import {
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  parseISO,
  startOfMonth,
  startOfWeek,
} from 'date-fns'
import { Card } from '../components/ui'
import { scheduleEvents } from '../data/mockData'
import type { ScheduleEvent } from '../types'
import { formatDateWithDay } from '../lib/format'

const current = parseISO('2026-07-21')
const today = parseISO('2026-07-21')
const weekdays = ['日', '月', '火', '水', '木', '金', '土']

const categoryStyles: Record<ScheduleEvent['category'], string> = {
  会議: 'bg-brand-100 text-brand-700',
  締切: 'bg-rose-100 text-rose-700',
  訪問: 'bg-emerald-100 text-emerald-700',
  社内: 'bg-amber-100 text-amber-700',
}

const categoryDot: Record<ScheduleEvent['category'], string> = {
  会議: 'bg-brand-500',
  締切: 'bg-rose-500',
  訪問: 'bg-emerald-500',
  社内: 'bg-amber-500',
}

export default function Schedule() {
  const monthStart = startOfMonth(current)
  const monthEnd = endOfMonth(current)
  const days = eachDayOfInterval({
    start: startOfWeek(monthStart),
    end: endOfWeek(monthEnd),
  })

  const eventsByDate = (date: Date) =>
    scheduleEvents.filter((e) => isSameDay(parseISO(e.date), date))

  const upcoming = [...scheduleEvents].sort((a, b) =>
    a.date === b.date ? a.time.localeCompare(b.time) : a.date.localeCompare(b.date),
  )

  return (
    <div className="grid grid-cols-3 gap-5">
      <Card title={format(current, 'yyyy年 M月')} className="col-span-2">
        <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border border-slate-100 bg-slate-100">
          {weekdays.map((w, i) => (
            <div
              key={w}
              className={`bg-slate-50 py-2 text-center text-xs font-semibold ${
                i === 0 ? 'text-rose-500' : i === 6 ? 'text-brand-500' : 'text-slate-500'
              }`}
            >
              {w}
            </div>
          ))}
          {days.map((day) => {
            const inMonth = isSameMonth(day, current)
            const isToday = isSameDay(day, today)
            const dayEvents = eventsByDate(day)
            return (
              <div
                key={day.toISOString()}
                className={`min-h-[92px] bg-white p-1.5 ${inMonth ? '' : 'bg-slate-50/60'}`}
              >
                <div
                  className={`mb-1 flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${
                    isToday
                      ? 'bg-brand-500 text-white'
                      : inMonth
                        ? 'text-slate-600'
                        : 'text-slate-300'
                  }`}
                >
                  {format(day, 'd')}
                </div>
                <div className="space-y-1">
                  {dayEvents.map((e) => (
                    <div
                      key={e.id}
                      className={`truncate rounded px-1.5 py-0.5 text-[11px] font-medium ${categoryStyles[e.category]}`}
                    >
                      {e.time} {e.title}
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </Card>

      <Card title="今後の予定">
        <ul className="space-y-3">
          {upcoming.map((e) => (
            <li key={e.id} className="flex items-start gap-3">
              <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${categoryDot[e.category]}`} />
              <div>
                <p className="text-sm font-medium text-slate-700">{e.title}</p>
                <p className="text-xs text-slate-400">
                  {formatDateWithDay(e.date)} {e.time} ・ {e.category}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  )
}
