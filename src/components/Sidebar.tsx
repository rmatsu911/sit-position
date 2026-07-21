import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  FolderKanban,
  Users,
  CalendarDays,
  BarChart3,
  Settings,
  LayoutGrid,
} from 'lucide-react'

const navItems = [
  { to: '/', label: 'ダッシュボード', icon: LayoutDashboard, end: true },
  { to: '/projects', label: '案件管理', icon: FolderKanban },
  { to: '/members', label: 'メンバー', icon: Users },
  { to: '/schedule', label: 'スケジュール', icon: CalendarDays },
  { to: '/reports', label: 'レポート', icon: BarChart3 },
  { to: '/settings', label: '設定', icon: Settings },
]

export default function Sidebar() {
  return (
    <aside className="flex h-full w-64 shrink-0 flex-col bg-slate-900 text-slate-200">
      <div className="flex items-center gap-3 px-6 py-6">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-500">
          <LayoutGrid size={22} className="text-white" />
        </div>
        <div>
          <p className="text-base font-bold text-white">業務管理システム</p>
          <p className="text-xs text-slate-400">Business Console</p>
        </div>
      </div>

      <nav className="mt-2 flex-1 space-y-1 px-3">
        {navItems.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-brand-500 text-white'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`
            }
          >
            <Icon size={20} />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-slate-800 px-6 py-4">
        <p className="text-xs text-slate-500">バージョン 1.0.0</p>
        <p className="text-xs text-slate-500">© 2026 Example Inc.</p>
      </div>
    </aside>
  )
}
