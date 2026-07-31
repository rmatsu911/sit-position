import { NavLink } from 'react-router-dom'
import { SCHEDULE_TABS, scheduleTabHref } from './tabs'

/** 工程管理のタブ（案件工程／横断工程／横断マイルストーン／カレンダー）。 */
export function ScheduleTabs({ projectId }: { projectId?: number }) {
  return (
    <div className="mb-3 flex flex-wrap gap-0.5 border-b border-line">
      {SCHEDULE_TABS.map((t) => (
        <NavLink
          key={t.key}
          to={scheduleTabHref(t, projectId)}
          end={t.path === ''}
          className={({ isActive }) =>
            `-mb-px flex items-center gap-1.5 border-b-2 px-3.5 py-2 text-[13px] font-medium ${
              isActive ? 'border-sysken-500 text-sysken-700' : 'border-transparent text-ink-soft hover:text-ink'
            }`
          }
        >
          <t.icon size={15} />
          {t.label}
        </NavLink>
      ))}
    </div>
  )
}
