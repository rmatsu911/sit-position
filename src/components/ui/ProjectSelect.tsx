/**
 * 画面共通の案件選択。
 *
 * 固定の案件IDは持たない。選択状態はURL（`?project_id=`）を正とし、
 * 再読込・URL共有・戻る進むで同じ案件が開く。先頭の案件を勝手に選ばない。
 */
import { useSearchParams } from 'react-router-dom'
import { FolderOpen } from 'lucide-react'
import { useProjects } from '../../api/projects'

/** URLの `project_id` を読み書きする。未選択は undefined。 */
export function useSelectedProject() {
  const [params, setParams] = useSearchParams()
  const raw = Number(params.get('project_id'))
  const projectId = Number.isFinite(raw) && raw > 0 ? raw : undefined
  const setProjectId = (id: number | undefined) => {
    const next = new URLSearchParams(params)
    if (id) next.set('project_id', String(id))
    else next.delete('project_id')
    setParams(next)
  }
  return { projectId, setProjectId }
}

/** 案件を選ぶドロップダウン。既定では何も選ばない（空欄のまま）。 */
export function ProjectSelect({
  projectId, onChange, className = '',
}: {
  projectId: number | undefined
  onChange: (id: number | undefined) => void
  className?: string
}) {
  const { data: projects = [], isLoading } = useProjects()
  return (
    <select
      className={`field !w-72 !py-1 text-xs ${className}`}
      aria-label="対象案件"
      data-project-select
      value={projectId ?? ''}
      onChange={(e) => onChange(e.target.value ? Number(e.target.value) : undefined)}
    >
      <option value="">{isLoading ? '案件を読み込み中…' : '案件を選択してください'}</option>
      {projects.map((p) => (
        <option key={p.id} value={p.id}>{p.construction_number} {p.name}</option>
      ))}
    </select>
  )
}

/** 案件が未選択のときの空状態。架空のデータは出さない。 */
export function NoProjectSelected({ what }: { what: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-16 text-center" data-no-project>
      <FolderOpen size={34} className="text-slate-300" />
      <p className="text-[14px] font-semibold text-ink">案件が選択されていません</p>
      <p className="max-w-md text-[13px] text-ink-soft">
        上の「対象案件」から案件を選ぶと、{what}を表示します。
      </p>
    </div>
  )
}
