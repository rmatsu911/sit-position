import {
  LayoutDashboard,
  FolderKanban,
  GanttChartSquare,
  Camera,
  FileBox,
  ShieldCheck,
  ClipboardList,
  Users,
  BookText,
  FileSpreadsheet,
  Bell,
  Settings,
  type LucideIcon,
} from 'lucide-react'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
}

export const navItems: NavItem[] = [
  { to: '/dashboard', label: 'ダッシュボード', icon: LayoutDashboard },
  { to: '/projects', label: '案件一覧', icon: FolderKanban },
  { to: '/schedule', label: '工程管理', icon: GanttChartSquare },
  { to: '/photos', label: '施工写真', icon: Camera },
  { to: '/drawings', label: '図面', icon: FileBox },
  { to: '/quality', label: '品質管理', icon: ShieldCheck },
  { to: '/daily-report', label: '現場日報', icon: ClipboardList },
  { to: '/personnel', label: '要員管理', icon: Users },
  { to: '/ledger', label: '工事台帳', icon: BookText },
  { to: '/reports', label: '報告書', icon: FileSpreadsheet },
  { to: '/notifications', label: '通知', icon: Bell },
  { to: '/settings', label: '設定', icon: Settings },
]

export const routeTitle: Record<string, string> = {
  '/dashboard': 'ダッシュボード',
  '/projects': '案件一覧',
  '/schedule': '工程管理',
  '/photos': '施工写真',
  '/drawings': '図面',
  '/quality': '品質管理',
  '/daily-report': '現場日報',
  '/personnel': '要員管理',
  '/ledger': '工事台帳',
  '/reports': '報告書',
  '/notifications': '通知',
  '/settings': '設定',
  '/consultation': 'AI施工判断',
}
