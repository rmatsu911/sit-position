import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Construction, type LucideIcon } from 'lucide-react'
import { PageHeader } from '../../components/layout/Breadcrumb'
import { Panel } from '../../components/ui/common'
import { useProject, useProjects } from '../../api/projects'
import { ScheduleTabs } from './ScheduleTabs'

/**
 * 未実装タブの画面枠。
 *
 * 完成していない機能をダミーデータで埋めない。何が未実装で、実装後に何が
 * 表示されるのかだけを明示し、完成済みと誤認させない。
 */
export function ScheduleComingSoon({
  title, description, icon: Icon, planned,
}: {
  title: string
  description: string
  icon: LucideIcon
  /** 実装後にこの画面でできるようになること */
  planned: string[]
}) {
  const navigate = useNavigate()
  const { id } = useParams()
  const [searchParams] = useSearchParams()
  const { data: projects = [] } = useProjects()
  const requested = Number(id ?? searchParams.get('project_id'))
  const projectId = Number.isFinite(requested) && requested > 0 ? requested : projects[0]?.id
  const { data: project } = useProject(projectId)

  return (
    <div>
      <PageHeader
        breadcrumb={[
          { label: '案件一覧', to: '/projects' },
          { label: project?.name ?? '案件を選択', to: projectId ? `/projects/${projectId}` : '/projects' },
          { label: '工程管理' },
        ]}
        title="工程管理"
        description={`${project?.name ?? '案件未選択'} ／ ${title}`}
        actions={
          <select
            className="field !w-64 !py-1 text-xs"
            value={projectId ?? ''}
            onChange={(e) => navigate(`/projects/${e.target.value}/schedule`)}
          >
            <option value="" disabled>案件を選択</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.construction_number} {p.name}</option>)}
          </select>
        }
      />

      <ScheduleTabs projectId={projectId} />

      <Panel>
        <div className="flex flex-col items-center justify-center gap-3 px-4 py-16 text-center">
          <Icon size={40} className="text-slate-300" />
          <p className="text-[15px] font-semibold text-ink">{title}は未実装です</p>
          <p className="max-w-xl text-[13px] leading-relaxed text-ink-soft">{description}</p>
          <div className="mt-2 w-full max-w-xl rounded border border-line bg-canvas px-4 py-3 text-left">
            <p className="mb-1.5 flex items-center gap-1.5 text-[12.5px] font-semibold text-ink-soft">
              <Construction size={14} />実装予定の機能
            </p>
            <ul className="space-y-1 text-[13px] text-ink">
              {planned.map((p) => (
                <li key={p} className="flex items-start gap-2">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-slate-400" />
                  {p}
                </li>
              ))}
            </ul>
          </div>
          <p className="text-[12px] text-ink-soft">
            現在ご利用いただけるのは「案件工程」タブです。
          </p>
        </div>
      </Panel>
    </div>
  )
}
