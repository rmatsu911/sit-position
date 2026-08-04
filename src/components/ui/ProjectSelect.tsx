/**
 * 画面共通の案件コンテキスト。
 *
 * 選択案件の正本は URL。`/projects/:id/...` ではパスの `:id`、それ以外の画面では
 * `?project_id=` を正とする。画面が独自の state や固定文字列で案件を持たない。
 * 案件名・工事番号は必ず案件API（`useProject`）から取得する。
 */
import { useParams, useSearchParams } from 'react-router-dom'
import { FolderOpen } from 'lucide-react'
import { useProject, useProjects, type ApiProject } from '../../api/projects'

/**
 * 選択中の案件ID。
 *
 * パスの `:id`（`/projects/:id/schedule` 等）→ `?project_id=` の順で解決する。
 * どちらも無ければ undefined（＝未選択。先頭の案件を勝手に選ばない）。
 */
export function useSelectedProject() {
  const { id: pathId } = useParams()
  const [params, setParams] = useSearchParams()
  const pick = (v: number) => (Number.isFinite(v) && v > 0 ? v : undefined)
  // パスで案件が決まる画面では、そちらが正本（クエリでは上書きしない）
  const inPath = pick(Number(pathId))
  const projectId = inPath ?? pick(Number(params.get('project_id')))

  const setProjectId = (id: number | undefined) => {
    const next = new URLSearchParams(params)
    if (id) next.set('project_id', String(id))
    else next.delete('project_id')
    setParams(next)
  }
  return { projectId, setProjectId, fixedByPath: inPath !== undefined }
}

/**
 * 選択中の案件の実データ。案件名・工事番号はここからしか取らない。
 * 画面ごとに別の名称が出ないよう、表示用のラベルも1か所で組み立てる。
 */
export function useProjectContext() {
  const { projectId, setProjectId, fixedByPath } = useSelectedProject()
  const { data: project, isLoading, isError } = useProject(projectId)
  return {
    projectId,
    setProjectId,
    fixedByPath,
    project,
    isLoading,
    isError,
    /** 「工事番号 工事名」。未選択・取得前は undefined（仮の名前を出さない） */
    label: project ? projectLabel(project) : undefined,
  }
}

/** 案件の表示名。パンくず・見出し・帳票・ファイル名で同じ組み立てを使う。 */
export function projectLabel(p: ApiProject): string {
  return `${p.construction_number} ${p.name}`
}

/** 案件を選ぶドロップダウン。既定では何も選ばない（空欄のまま）。 */
export function ProjectSelect({
  projectId, onChange, className = '', disabled = false,
}: {
  projectId: number | undefined
  onChange: (id: number | undefined) => void
  className?: string
  disabled?: boolean
}) {
  const { data: projects = [], isLoading } = useProjects()
  return (
    <select
      className={`field !w-72 !py-1 text-xs ${className}`}
      aria-label="対象案件"
      data-project-select
      disabled={disabled}
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

/**
 * 案件配下の画面で、対象案件を固定表示する。
 * URLの案件が正本なので選び直させず、案件名・工事番号だけを見せる。
 */
export function FixedProject({ label }: { label: string | undefined }) {
  return (
    <span className="rounded border border-line bg-canvas px-2 py-1 text-xs text-ink" data-fixed-project>
      {label ?? '案件を読み込み中…'}
    </span>
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
