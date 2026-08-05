import { useState } from 'react'
import {
  ZoomIn, ZoomOut, RotateCw, Maximize2, Layers,
  MapPin, MessageSquare, StickyNote, Highlighter, Square, Printer, Download, GitCompare,
} from 'lucide-react'
import { PageHeader } from '../components/layout/Breadcrumb'
import { Panel } from '../components/ui/common'
import { StatusBadge } from '../components/ui/Badge'
import { useApp } from '../context/AppContext'
import { useDocuments, useDocument } from '../api/documents'
import { useProject } from '../api/projects'
import { FixedProject, NoProjectSelected, ProjectSelect, projectLabel, useSelectedProject } from '../components/ui/ProjectSelect'

export default function Drawings() {
  const { toast } = useApp()
  // 対象案件の正本は URL（案件配下ルートはパスの :id、横断ルートは ?project_id=）
  const { projectId, setProjectId, fixedByPath } = useSelectedProject()
  const { data: project } = useProject(projectId)
  const { data: drawings = [], isLoading } = useDocuments(projectId)
  const [current, setCurrent] = useState<string | null>(null)
  const [zoom, setZoom] = useState(1)
  const [rotate, setRotate] = useState(0)
  const dwg = drawings.find((d) => d.id === current) ?? drawings[0]
  const { data: docDetail } = useDocument(dwg?.id)
  // 最新版の実ファイル（PDF/画像）
  const latest = docDetail?.versions?.[0]
  const fileUrl = latest?.file_url ?? null
  const mime = latest?.mime_type ?? ''
  const isPdf = mime === 'application/pdf'
  const isImage = mime.startsWith('image/')

  const tools = [
    { icon: ZoomIn, label: '拡大', onClick: () => setZoom((z) => Math.min(2.5, z + 0.2)) },
    { icon: ZoomOut, label: '縮小', onClick: () => setZoom((z) => Math.max(0.5, z - 0.2)) },
    { icon: RotateCw, label: '回転', onClick: () => setRotate((r) => (r + 90) % 360) },
    { icon: Maximize2, label: '全体表示', onClick: () => { setZoom(1); setRotate(0) } },
    { icon: Layers, label: 'レイヤー', onClick: () => toast('この操作は現在準備中です', 'info') },
    { icon: MapPin, label: 'ピン追加', onClick: () => toast('この操作は現在準備中です', 'info') },
    { icon: MessageSquare, label: 'コメント', onClick: () => toast('この操作は現在準備中です', 'info') },
    { icon: StickyNote, label: '付箋', onClick: () => toast('この操作は現在準備中です', 'info') },
    { icon: Highlighter, label: 'マーカー', onClick: () => toast('この操作は現在準備中です') },
    { icon: Square, label: '矩形選択', onClick: () => toast('この操作は現在準備中です') },
    { icon: GitCompare, label: '版比較', onClick: () => toast('この操作は現在準備中です') },
    { icon: Printer, label: '印刷', onClick: () => toast('この操作は現在準備中です') },
    { icon: Download, label: 'ダウンロード', onClick: () => toast('この操作は現在準備中です') },
  ]

  return (
    <div>
      <PageHeader breadcrumb={[{ label: '図面' }]} title="図面"
        description={projectId ? '選択した案件の図面・書類' : '対象案件を選ぶと、その案件の図面に絞り込みます'}
        actions={
          <div className="flex items-center gap-2">
            <span className="text-[12px] text-ink-soft">対象案件</span>
            {fixedByPath
              ? <FixedProject label={project ? projectLabel(project) : undefined} />
              : <ProjectSelect projectId={projectId} onChange={setProjectId} />}
          </div>
        } />
      {/* 案件が決まらないと図面を絞り込めない。
          「図面が登録されていません」と出すと、未選択なのか0件なのか区別できない。 */}
      {!projectId && <Panel><NoProjectSelected what="この案件の図面・書類" /></Panel>}
      {projectId && (
      <div className="flex gap-4">
        {/* 左：図面一覧 */}
        <div className="w-72 shrink-0">
          <Panel title="図面一覧" bodyClassName="p-0">
            <ul className="divide-y divide-line">
              {drawings.map((d) => (
                <li key={d.id}>
                  <button onClick={() => setCurrent(d.id)} className={`w-full px-3 py-2.5 text-left hover:bg-canvas ${current === d.id ? 'bg-sysken-50' : ''}`}>
                    <div className="flex items-center justify-between">
                      <span className="text-xs tabular-nums text-ink-soft">{d.no}</span>
                      <StatusBadge status={d.approval} />
                    </div>
                    <p className="mt-0.5 text-[13px] font-medium text-ink">{d.name}</p>
                    <p className="text-[11px] text-slate-400">{d.type} ／ {d.rev} ／ {d.updatedBy}</p>
                  </button>
                </li>
              ))}
            </ul>
          </Panel>
        </div>

        {/* 中央：プレビュー */}
        <div className="min-w-0 flex-1">
          {/* ツールバー */}
          <div className="mb-2 flex flex-wrap items-center gap-0.5 rounded border border-line bg-white px-2 py-1.5">
            {tools.map((t) => (
              <button key={t.label} onClick={t.onClick} className="flex items-center gap-1 rounded px-1.5 py-1 text-xs text-ink hover:bg-canvas" title={t.label}>
                <t.icon size={15} className="text-sysken-600" /><span className="hidden xl:inline">{t.label}</span>
              </button>
            ))}
            <span className="ml-auto text-xs text-ink-soft">{Math.round(zoom * 100)}%</span>
          </div>

          {isLoading && <Panel><p className="py-10 text-center text-sm text-ink-soft">図面を読み込んでいます…</p></Panel>}
          {!isLoading && !dwg && <Panel><p className="py-10 text-center text-sm text-ink-soft">図面が登録されていません。</p></Panel>}
          {dwg && (
          <Panel bodyClassName="p-0" className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-line bg-canvas px-3 py-2">
              <div><span className="text-[13px] font-semibold text-ink">{dwg.name}</span><span className="ml-2 text-xs text-ink-soft">{dwg.no} / {dwg.rev}</span></div>
              <StatusBadge status={dwg.approval} />
            </div>
            {isPdf ? (
              /* 実PDFをブラウザ表示 */
              <iframe title={dwg.name} src={fileUrl!} className="w-full border-0 bg-slate-200" style={{ height: 'calc(100vh - 300px)' }} />
            ) : isImage ? (
              /* 実画像（PNG/JPEG）を表示 */
              <div className="thin-scroll flex items-center justify-center overflow-auto bg-slate-200 p-8" style={{ height: 'calc(100vh - 300px)' }}>
                <img src={fileUrl!} alt={dwg.name} className="max-h-full max-w-full bg-white shadow-pop"
                  style={{ transform: `scale(${zoom}) rotate(${rotate}deg)`, transition: 'transform 0.15s' }} />
              </div>
            ) : fileUrl ? (
              /* 対応外形式：ファイル情報＋ダウンロード */
              <div className="flex flex-col items-center justify-center gap-3 bg-slate-100 p-8 text-center" style={{ height: 'calc(100vh - 300px)' }}>
                <p className="text-[13px] text-ink-soft">この形式（{latest?.original_filename ?? 'ファイル'}）はブラウザプレビューに対応していません。</p>
                <a href={fileUrl} download className="btn-primary"><Download size={15} />ファイルをダウンロード</a>
              </div>
            ) : (
              /* 実ファイル未登録：偽の図面を表示せず、未登録であることを明示する */
              <div className="flex flex-col items-center justify-center gap-3 bg-slate-100 p-8 text-center" style={{ height: 'calc(100vh - 300px)' }}>
                <Layers size={40} className="text-slate-300" />
                <p className="text-[14px] font-semibold text-ink">図面ファイルが登録されていません</p>
                <p className="max-w-md text-[13px] text-ink-soft">
                  この図面には表示できる実ファイル（PDF／画像）が登録されていません。図面ファイルを登録すると、ここにプレビューが表示されます。
                </p>
              </div>
            )}
          </Panel>
          )}
        </div>
      </div>
      )}
    </div>
  )
}

