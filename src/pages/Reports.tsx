import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { TrendingUp, Target, Percent } from 'lucide-react'
import { Card, StatCard } from '../components/ui'
import { monthlySales, weeklyActivity } from '../data/mockData'
import { formatManYen } from '../lib/format'

export default function Reports() {
  const totalSales = monthlySales.reduce((s, m) => s + m.売上, 0)
  const totalTarget = monthlySales.reduce((s, m) => s + m.目標, 0)
  const achievement = Math.round((totalSales / totalTarget) * 100)

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-5">
        <StatCard label="累計売上" value={formatManYen(totalSales)} sub="1月〜7月" icon={TrendingUp} tone="brand" />
        <StatCard label="累計目標" value={formatManYen(totalTarget)} sub="1月〜7月" icon={Target} tone="amber" />
        <StatCard label="目標達成率" value={`${achievement}%`} sub="目標比" icon={Percent} tone="green" />
      </div>

      <Card title="売上 vs 目標（月次）">
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={monthlySales} margin={{ top: 10, right: 10, left: 0, bottom: 0 }} barGap={6}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef1f6" vertical={false} />
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
                cursor={{ fill: '#f8fafc' }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="売上" fill="#3366f2" radius={[4, 4, 0, 0]} maxBarSize={36} />
              <Bar dataKey="目標" fill="#cbd5e1" radius={[4, 4, 0, 0]} maxBarSize={36} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card title="週間アクティビティ">
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={weeklyActivity} margin={{ top: 10, right: 10, left: 0, bottom: 0 }} barGap={4}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef1f6" vertical={false} />
              <XAxis dataKey="day" tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <Tooltip
                formatter={(v: number) => `${v}件`}
                contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }}
                cursor={{ fill: '#f8fafc' }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="対応件数" fill="#598eff" radius={[4, 4, 0, 0]} maxBarSize={28} />
              <Bar dataKey="完了件数" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={28} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </div>
  )
}
