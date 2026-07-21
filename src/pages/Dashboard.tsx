import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  FolderKanban,
  CheckCircle2,
  Clock,
  Wallet,
  ArrowUpRight,
} from 'lucide-react'
import { Card, StatCard, StatusBadge, PriorityBadge } from '../components/ui'
import {
  categoryShare,
  monthlySales,
  projects,
  tasks,
} from '../data/mockData'
import { formatManYen, formatDateWithDay } from '../lib/format'

const pieColors = ['#3366f2', '#598eff', '#8eb6ff', '#bcd3ff']

export default function Dashboard() {
  const activeProjects = projects.filter((p) => p.status === '進行中').length
  const completedProjects = projects.filter((p) => p.status === '完了').length
  const openTasks = tasks.filter((t) => t.status !== '完了').length
  const totalBudget = projects.reduce((sum, p) => sum + p.budget, 0)

  const upcomingTasks = [...tasks]
    .filter((t) => t.status !== '完了')
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .slice(0, 5)

  return (
    <div className="space-y-6">
      {/* KPIカード */}
      <div className="grid grid-cols-4 gap-5">
        <StatCard label="進行中の案件" value={`${activeProjects}件`} sub="今月 +2件" icon={FolderKanban} tone="brand" />
        <StatCard label="完了案件" value={`${completedProjects}件`} sub="今年度累計" icon={CheckCircle2} tone="green" />
        <StatCard label="未完了タスク" value={`${openTasks}件`} sub="要対応" icon={Clock} tone="amber" />
        <StatCard label="総予算" value={formatManYen(totalBudget)} sub="全案件合計" icon={Wallet} tone="rose" />
      </div>

      {/* チャート */}
      <div className="grid grid-cols-3 gap-5">
        <Card title="月次売上推移" className="col-span-2">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={monthlySales} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3366f2" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#3366f2" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef1f6" />
                <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis
                  tickFormatter={(v) => `${v / 10000000}千万`}
                  tick={{ fontSize: 12, fill: '#94a3b8' }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  formatter={(v: number) => formatManYen(v)}
                  contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Area type="monotone" dataKey="売上" stroke="#3366f2" strokeWidth={2.5} fill="url(#salesFill)" />
                <Line type="monotone" dataKey="目標" stroke="#f59e0b" strokeWidth={2} strokeDasharray="5 5" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title="案件カテゴリ構成">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={categoryShare}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="45%"
                  innerRadius={55}
                  outerRadius={85}
                  paddingAngle={2}
                >
                  {categoryShare.map((_, i) => (
                    <Cell key={i} fill={pieColors[i % pieColors.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(v: number) => `${v}%`}
                  contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* 期限が近いタスク & 進行中案件 */}
      <div className="grid grid-cols-2 gap-5">
        <Card title="期限が近いタスク">
          <ul className="divide-y divide-slate-100">
            {upcomingTasks.map((t) => (
              <li key={t.id} className="flex items-center justify-between py-3">
                <div>
                  <p className="text-sm font-medium text-slate-700">{t.title}</p>
                  <p className="text-xs text-slate-400">
                    {t.assignee} ・ {formatDateWithDay(t.dueDate)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <PriorityBadge priority={t.priority} />
                  <StatusBadge status={t.status} />
                </div>
              </li>
            ))}
          </ul>
        </Card>

        <Card
          title="進行中の案件"
          action={
            <span className="flex items-center gap-1 text-xs font-medium text-brand-600">
              すべて表示 <ArrowUpRight size={14} />
            </span>
          }
        >
          <ul className="space-y-4">
            {projects
              .filter((p) => p.status === '進行中')
              .slice(0, 4)
              .map((p) => (
                <li key={p.id}>
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-slate-700">{p.name}</p>
                    <span className="text-xs text-slate-400">{p.progress}%</span>
                  </div>
                  <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-brand-500" style={{ width: `${p.progress}%` }} />
                  </div>
                </li>
              ))}
          </ul>
        </Card>
      </div>
    </div>
  )
}
