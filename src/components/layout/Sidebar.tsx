import { NavLink } from 'react-router-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { navItems } from '../../nav'
import { useApp } from '../../context/AppContext'

export function Sidebar() {
  const { sidebarCollapsed, toggleSidebar } = useApp()
  return (
    <aside
      data-print="hide"
      className={`flex h-full shrink-0 flex-col border-r border-line bg-sysken-700 text-slate-100 transition-[width] duration-150 ${
        sidebarCollapsed ? 'w-14' : 'w-56'
      }`}
    >
      <nav className="thin-scroll flex-1 space-y-0.5 overflow-y-auto px-2 py-3">
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            title={sidebarCollapsed ? label : undefined}
            className={({ isActive }) =>
              `relative flex items-center gap-3 rounded px-2.5 py-2 text-[13px] font-medium transition-colors ${
                isActive
                  ? 'bg-white/15 text-white before:absolute before:left-0 before:top-1/2 before:h-5 before:w-1 before:-translate-y-1/2 before:rounded-r before:bg-white'
                  : 'text-slate-200 hover:bg-white/10 hover:text-white'
              } ${sidebarCollapsed ? 'justify-center' : ''}`
            }
          >
            <Icon size={19} className="shrink-0" />
            {!sidebarCollapsed && <span className="truncate">{label}</span>}
          </NavLink>
        ))}
      </nav>
      <button
        onClick={toggleSidebar}
        className="flex items-center gap-2 border-t border-white/10 px-3 py-2.5 text-xs text-slate-200 hover:bg-white/10"
      >
        {sidebarCollapsed ? (
          <ChevronRight size={18} className="mx-auto" />
        ) : (
          <>
            <ChevronLeft size={18} />
            メニューを折りたたむ
          </>
        )}
      </button>
    </aside>
  )
}
