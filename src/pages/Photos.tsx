import { useMemo, useState, useEffect } from 'react'
import {
  Grid3x3, List as ListIcon, Star, Upload, Download, Trash2, Tag, CheckCircle2,
  ChevronLeft, ChevronRight, MapPin, Camera, Filter,
} from 'lucide-react'
import { PageHeader } from '../components/layout/Breadcrumb'
import { Panel } from '../components/ui/common'
import { Badge, StatusBadge } from '../components/ui/Badge'
import { Modal } from '../components/ui/Modal'
import { PhotoImage } from '../components/ui/PhotoImage'
import { RecognitionOverlay, RecognitionLegend } from '../components/ui/RecognitionOverlay'
import { useApp } from '../context/AppContext'
import { qualityJudgeFor, boxColor, type Recognition } from '../data/aiPreview'
import {
  usePhotos, usePhotoAi, useUploadPhoto, useUpdatePhoto, useConfirmPhoto, useDeletePhoto,
  usePredictionFeedback, useReportMissed,
} from '../api/photos'
import { useProject, useProjects } from '../api/projects'
import { useSites, useAssets } from '../api/sites'
import { NoProjectSelected, ProjectSelect, useSelectedProject } from '../components/ui/ProjectSelect'
import { useTaskOptions } from '../api/tasks'
import type { Photo } from '../types'

type ViewMode = 'thumb' | 'list' | 'process' | 'date' | 'equip'

export default function Photos() {
  const { toast, confirm } = useApp()
  // 対象案件は利用者が選ぶ（固定案件へ寄せない）。選択状態はURLで復元する。
  const { projectId, setProjectId } = useSelectedProject()
  const { data: project } = useProject(projectId)
  const { data: photoData, isLoading, isError, refetch } = usePhotos(projectId)
  const uploadMut = useUploadPhoto()
  const updateMut = useUpdatePhoto()
  const confirmMut = useConfirmPhoto()
  const deleteMut = useDeletePhoto()
  const [photos, setPhotos] = useState<Photo[]>([])
  const [view, setView] = useState<ViewMode>('thumb')
  const [tagFilter, setTagFilter] = useState<string>('all')
  const [confirmFilter, setConfirmFilter] = useState<string>('all')
  const [onlyFav, setOnlyFav] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [lightbox, setLightbox] = useState<number | null>(null)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploadPlace, setUploadPlace] = useState('')
  // アップロード時の Project→Site→Asset→Task 連動選択
  const [upProject, setUpProject] = useState<number>(0)
  const [upSite, setUpSite] = useState<number | ''>('')
  const [upAsset, setUpAsset] = useState<number | ''>('')
  const [upTask, setUpTask] = useState<number | ''>('')
  const { data: projectOpts = [] } = useProjects()
  const { data: siteOpts = [] } = useSites(upProject)
  const { data: assetOpts = [] } = useAssets(upProject, upSite || undefined)
  // 設備を選ぶとその設備に紐づく工程を優先表示（task_assets）
  const { data: taskOpts = [] } = useTaskOptions(upProject, upSite || undefined, upAsset || undefined)
  const [classTargetId, setClassTargetId] = useState<string>('')
  const [reflected, setReflected] = useState<Set<string>>(new Set())

  // 案件が変わったら、案件に紐づく状態をレンダリング前に捨てる。
  // useEffect で消すと1回だけ前の案件の写真が描画されてしまうため、描画前に初期化する。
  const [photosProjectId, setPhotosProjectId] = useState(projectId)
  if (photosProjectId !== projectId) {
    setPhotosProjectId(projectId)
    setPhotos([])
    setSelected(new Set())
    setLightbox(null)
    setClassTargetId('')
    setReflected(new Set())
    // タグの選択肢は案件ごとに違うため、絞り込みも初期化する
    setTagFilter('all')
    setConfirmFilter('all')
    setOnlyFav(false)
    setUploadOpen(false)
  }

  // API から取得した写真をローカル状態へ反映（即時操作のためローカルに保持）
  useEffect(() => {
    // 取得前・未選択のときは前の案件の写真を残さない
    if (!photoData) {
      setPhotos([])
      setClassTargetId('')
      return
    }
    setPhotos(photoData)
    if (photoData.length && !photoData.some((p) => p.id === classTargetId)) {
      setClassTargetId(photoData[0].id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photoData])

  const photoTags = useMemo(() => Array.from(new Set(photos.flatMap((p) => p.tags))).sort(), [photos])

  const filtered = useMemo(() => {
    return photos.filter((p) => {
      if (tagFilter !== 'all' && !p.tags.includes(tagFilter)) return false
      if (confirmFilter !== 'all' && p.confirm !== confirmFilter) return false
      if (onlyFav && !p.favorite) return false
      return true
    })
  }, [photos, tagFilter, confirmFilter, onlyFav])

  function toggleFav(id: string) {
    const next = !photos.find((p) => p.id === id)?.favorite
    setPhotos((prev) => prev.map((p) => (p.id === id ? { ...p, favorite: next } : p)))
    updateMut.mutate({ id, favorite: next }, { onError: () => { toast('お気に入りの保存に失敗しました', 'ng'); refetch() } })
  }
  function setConfirm(id: string, val: Photo['confirm']) {
    setPhotos((prev) => prev.map((p) => (p.id === id ? { ...p, confirm: val } : p)))
    confirmMut.mutate({ id, confirmation_status: val }, {
      onSuccess: () => toast(`写真を「${val}」に変更しました`, 'ok'),
      onError: () => { toast('確認状況の保存に失敗しました', 'ng'); refetch() },
    })
  }
  function toggleSelect(id: string) {
    setSelected((prev) => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }

  // アップロード（API連携）
  function startUpload() {
    // 案件未選択のままアップロード画面を開かない（登録先が決まらない）
    if (!projectId) { toast('対象案件を選択してください', 'ng'); return }
    setUploadFile(null)
    setUploadPlace('')
    setUpProject(projectId)
    setUpSite(''); setUpAsset(''); setUpTask('')
    setUploadOpen(true)
  }
  function runUpload() {
    if (!uploadFile) return
    // 登録先の案件は実行前に検証する（0 などの既定値で登録しない）
    if (!upProject) { toast('登録先の案件を選択してください', 'ng'); return }
    uploadMut.mutate(
      {
        file: uploadFile, place: uploadPlace || undefined, project_id: upProject,
        site_id: upSite || undefined, asset_id: upAsset || undefined, task_id: upTask || undefined,
      },
      {
        onSuccess: () => { setUploadOpen(false); toast('写真をアップロードしました', 'ok') },
        onError: () => toast('アップロードに失敗しました', 'ng'),
      },
    )
  }

  // AI認識結果を写真情報へ反映（AI結果＝APIのrecognitionのみ。固定推定は使わない）
  function reflectClassification(id: string, recog: Partial<Recognition>) {
    const target = photos.find((p) => p.id === id)
    if (!target) return
    const addTags = [recog.認識結果, recog.設備判定].filter((t): t is string => Boolean(t))
    if (!addTags.length && !recog.工種判定 && !recog.工程判定) {
      toast('反映できるAI認識結果がありません', 'warn')
      return
    }
    const nextTags = Array.from(new Set([...target.tags, ...addTags]))
    setPhotos((prev) => prev.map((p) => (p.id === id
      ? { ...p, tags: nextTags, workType: recog.工種判定 ?? p.workType, process: recog.工程判定 ?? p.process }
      : p)))
    setReflected((prev) => new Set(prev).add(id))
    updateMut.mutate({ id, tags: nextTags }, { onError: () => toast('反映結果の保存に失敗しました', 'ng') })
    toast('AI認識結果を写真情報へ反映しました。', 'ok')
  }

  const stats = {
    total: photos.length,
    unconfirmed: photos.filter((p) => p.confirm === '未確認').length,
    recheck: photos.filter((p) => p.confirm === '再撮影依頼').length,
    fav: photos.filter((p) => p.favorite).length,
  }

  // 案件未選択のときは、案件セレクタと空状態だけを出す。
  // 一覧・アップロード・一括操作は描画しない（前の案件の写真も残さない）。
  if (!projectId) {
    return (
      <div>
        <PageHeader
          breadcrumb={[{ label: '案件一覧', to: '/projects' }, { label: '施工写真' }]}
          title="施工写真"
          description="対象案件を選択してください"
          actions={
            <>
              <span className="text-[12px] text-ink-soft">対象案件</span>
              <ProjectSelect projectId={projectId} onChange={setProjectId} />
            </>
          }
        />
        <Panel><NoProjectSelected what="施工写真" /></Panel>
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        breadcrumb={[{ label: '案件一覧', to: '/projects' }, { label: '対象案件', to: `/projects/${projectId}` }, { label: '施工写真' }]}
        title="施工写真"
        description={`全 ${stats.total} 枚 ／ 未確認 ${stats.unconfirmed} 枚 ／ 再撮影依頼 ${stats.recheck} 枚 ／ お気に入り ${stats.fav} 枚`}
        actions={
          <>
            <span className="text-[12px] text-ink-soft">対象案件</span>
            <ProjectSelect projectId={projectId} onChange={setProjectId} />
            <button className="btn-default" onClick={() => selected.size ? toast('一括タグ設定は現在準備中です', 'info') : toast('写真を選択してください')}><Tag size={15} />一括タグ</button>
            <button className="btn-default" onClick={() => toast('この操作は現在準備中です')}><Download size={15} />ダウンロード</button>
            <button className="btn-primary" onClick={startUpload}><Upload size={15} />写真追加</button>
          </>
        }
      />

      {/* ツールバー：表示切替＋フィルタ */}
      <div className="mb-3 flex flex-wrap items-center gap-2 rounded border border-line bg-white px-3 py-2">
        <div className="flex items-center gap-0.5 rounded border border-line p-0.5">
          {([['thumb', 'サムネイル', Grid3x3], ['list', '一覧', ListIcon], ['process', '工程別', Filter], ['date', '撮影日別', Camera], ['equip', '設備別', Tag]] as const).map(([v, label, Icon]) => (
            <button key={v} onClick={() => setView(v)} className={`flex items-center gap-1 rounded px-2 py-1 text-xs font-medium ${view === v ? 'bg-sysken-500 text-white' : 'text-ink hover:bg-canvas'}`}>
              <Icon size={14} />{label}
            </button>
          ))}
        </div>
        <div className="mx-1 h-6 w-px bg-line" />
        <select className="field !w-auto !py-1 text-xs" value={tagFilter} onChange={(e) => setTagFilter(e.target.value)}>
          <option value="all">タグ：すべて</option>
          {photoTags.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select className="field !w-auto !py-1 text-xs" value={confirmFilter} onChange={(e) => setConfirmFilter(e.target.value)}>
          <option value="all">確認状況：すべて</option>
          <option value="未確認">未確認</option>
          <option value="確認済み">確認済み</option>
          <option value="再撮影依頼">再撮影依頼</option>
        </select>
        <button onClick={() => setOnlyFav((v) => !v)} className={`flex items-center gap-1 rounded border px-2 py-1 text-xs ${onlyFav ? 'border-warn bg-amber-50 text-warn' : 'border-line text-ink hover:bg-canvas'}`}>
          <Star size={14} className={onlyFav ? 'fill-warn' : ''} />お気に入り
        </button>
        <span className="ml-auto text-xs text-ink-soft">{filtered.length} 枚表示</span>
      </div>

      {/* 読込・エラー・空 状態 */}
      {isLoading && <div className="rounded border border-line bg-white px-4 py-10 text-center text-[13px] text-ink-soft">写真を読み込んでいます…</div>}
      {isError && (
        <div className="rounded border border-red-200 bg-red-50 px-4 py-6 text-center text-[13px] text-ng">
          写真の取得に失敗しました。<button className="ml-2 underline" onClick={() => refetch()}>再試行</button>
        </div>
      )}
      {!isLoading && !isError && photos.length === 0 && (
        <div className="rounded border border-line bg-white px-4 py-10 text-center text-[13px] text-ink-soft">写真がまだ登録されていません。「写真追加」から登録してください。</div>
      )}

      {!isLoading && !isError && photos.length > 0 && (
        <>
          {/* AI施工写真分類 */}
          <ClassificationSupport
            photos={filtered.length ? filtered : photos}
            targetId={classTargetId}
            onTarget={setClassTargetId}
            reflected={reflected}
            onReflect={reflectClassification}
          />

          {/* 表示本体 */}
          {view === 'list' ? (
            <PhotoTable photos={filtered} onOpen={(p) => setLightbox(filtered.indexOf(p))} onFav={toggleFav} selected={selected} onSelect={toggleSelect} />
          ) : view === 'thumb' ? (
            <PhotoGrid photos={filtered} onOpen={(i) => setLightbox(i)} onFav={toggleFav} selected={selected} onSelect={toggleSelect} />
          ) : (
            <GroupedGrid photos={filtered} groupBy={view} onOpen={(p) => setLightbox(filtered.indexOf(p))} onFav={toggleFav} />
          )}
        </>
      )}

      {/* ライトボックス */}
      {lightbox !== null && filtered[lightbox] && (
        <Lightbox
          photo={filtered[lightbox]}
          projectLabel={project ? `${project.construction_number} ${project.name}` : '—'}
          hasPrev={lightbox > 0}
          hasNext={lightbox < filtered.length - 1}
          onPrev={() => setLightbox((i) => (i! > 0 ? i! - 1 : i))}
          onNext={() => setLightbox((i) => (i! < filtered.length - 1 ? i! + 1 : i))}
          onClose={() => setLightbox(null)}
          reflected={reflected.has(filtered[lightbox].id)}
          onReflect={(recog) => reflectClassification(filtered[lightbox].id, recog)}
          onFav={() => toggleFav(filtered[lightbox].id)}
          onConfirm={(v) => setConfirm(filtered[lightbox].id, v)}
          onComment={(text) => updateMut.mutate(
            { id: filtered[lightbox].id, comment: text },
            { onSuccess: () => toast('コメントを保存しました', 'ok'), onError: () => toast('コメントの保存に失敗しました', 'ng') },
          )}
          onDelete={async () => {
            const ok = await confirm({ title: '写真の削除', message: 'この写真を削除しますか？', confirmLabel: '削除', danger: true })
            if (ok) {
              const id = filtered[lightbox].id
              deleteMut.mutate({ id }, {
                onSuccess: () => { setPhotos((prev) => prev.filter((p) => p.id !== id)); setLightbox(null); toast('写真を削除しました', 'ok') },
                onError: () => toast('削除に失敗しました', 'ng'),
              })
            }
          }}
        />
      )}

      {/* アップロードモーダル（API連携） */}
      <Modal open={uploadOpen} onClose={() => !uploadMut.isPending && setUploadOpen(false)} title="写真アップロード"
        footer={
          <>
            <button className="btn-default" disabled={uploadMut.isPending} onClick={() => setUploadOpen(false)}>キャンセル</button>
            <button className="btn-primary" disabled={!uploadFile || uploadMut.isPending} onClick={runUpload}>
              <Upload size={15} />{uploadMut.isPending ? 'アップロード中…' : 'アップロード'}
            </button>
          </>
        }>
        <div className="space-y-3">
          <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded border-2 border-dashed border-line bg-canvas py-8 text-ink-soft hover:bg-slate-50">
            <Upload size={28} />
            <p className="text-[13px]">{uploadFile ? uploadFile.name : '写真ファイルを選択してください'}</p>
            <input type="file" accept="image/*" className="hidden" disabled={uploadMut.isPending}
              onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)} />
          </label>
          {/* Project → Site → Asset → Task 連動選択 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">案件（Project）</label>
              <select className="field" value={upProject} disabled={uploadMut.isPending}
                onChange={(e) => { setUpProject(Number(e.target.value)); setUpSite(''); setUpAsset(''); setUpTask('') }}>
                {projectOpts.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">現場（Site）</label>
              <select className="field" value={upSite} disabled={uploadMut.isPending}
                onChange={(e) => { setUpSite(e.target.value ? Number(e.target.value) : ''); setUpAsset(''); setUpTask('') }}>
                <option value="">選択してください</option>
                {siteOpts.map((s2) => <option key={s2.id} value={s2.id}>{s2.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">設備（Asset）</label>
              <select className="field" value={upAsset} disabled={uploadMut.isPending || !upSite}
                onChange={(e) => { setUpAsset(e.target.value ? Number(e.target.value) : ''); setUpTask('') }}>
                <option value="">{upSite ? '選択してください' : '先に現場を選択'}</option>
                {assetOpts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">工程（Task）</label>
              <select className="field" value={upTask} disabled={uploadMut.isPending || !upSite}
                onChange={(e) => setUpTask(e.target.value ? Number(e.target.value) : '')}>
                <option value="">{upSite ? '選択してください' : '先に現場を選択'}</option>
                {taskOpts.map((t) => <option key={t.id} value={t.id}>{t.wbs} {t.name}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="label">撮影場所（任意）</label>
            <input className="field" value={uploadPlace} disabled={uploadMut.isPending}
              onChange={(e) => setUploadPlace(e.target.value)} placeholder="例：局舎1F MDF室" />
          </div>
          {uploadMut.isPending && (
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100"><div className="h-full w-2/3 animate-pulse bg-sysken-500" /></div>
          )}
        </div>
      </Modal>

    </div>
  )
}

function ClassificationSupport({
  photos, targetId, onTarget, reflected, onReflect,
}: {
  photos: Photo[]
  targetId: string
  onTarget: (id: string) => void
  reflected: Set<string>
  onReflect: (id: string, recog: Partial<Recognition>) => void
}) {
  const target = photos.find((p) => p.id === targetId) ?? photos[0]
  const { data: ai, isLoading } = usePhotoAi(target?.id)
  if (!target) return null
  // AI推論結果はAPI(ai_predictions)のみ。無ければEmpty State（固定推定は行わない）。
  const useApi = !!ai && ai.source !== 'none'
  const c = ai?.recognition ?? {}
  const detections = useApi ? ai!.detections : []
  const boxes = useApi ? ai!.boxes : []
  const isReflected = reflected.has(target.id)
  const indoor = target.place.includes('局舎') || target.place.includes('MDF')
  const note = modelNote(ai)

  return (
    <Panel title="AI施工写真分類" className="mb-3"
      action={<span className="text-[12px] text-ink-soft">AIが施工写真を認識し、物体検出・分類・判定を行います</span>}>
      <div className="flex gap-4">
        {/* 対象写真＋検出枠 */}
        <div className="w-72 shrink-0">
          <div className="relative overflow-hidden rounded border border-line">
            <PhotoImage url={target.thumbUrl ?? target.imageUrl} type={target.colorKey} no={target.no} className="aspect-[4/3] w-full" indoor={indoor} board={{ process: target.process, date: target.takenAt }} />
            {useApi && <RecognitionOverlay boxes={boxes} />}
          </div>
          <div className="mt-2">
            <label className="label">対象写真</label>
            <select className="field" value={target.id} onChange={(e) => onTarget(e.target.value)}>
              {photos.map((p) => <option key={p.id} value={p.id}>{p.no}／{p.process}</option>)}
            </select>
          </div>
          {useApi && <div className="mt-2"><RecognitionLegend /></div>}
        </div>

        {/* AI認識結果 */}
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex items-center gap-2">
            <p className="text-[13px] font-semibold text-sysken-700">AI認識結果</p>
            {note && <Badge tone={note.tone}>{note.text}</Badge>}
          </div>

          {!useApi ? (
            <div className="rounded border border-dashed border-line bg-canvas px-4 py-8 text-center text-[13px] text-ink-soft">
              {isLoading ? 'AI解析結果を確認しています…' : 'この写真のAI解析結果はまだありません。'}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4">
                {/* 物体検出 */}
                <div>
                  <p className="mb-1 text-[11.5px] text-ink-soft">物体検出</p>
                  {detections.length ? (
                    <div className="space-y-1.5">
                      {detections.map((d) => (
                        <div key={d.label} className="flex items-center gap-2">
                          <span className="w-28 shrink-0 text-[13px] text-ink">{d.label}</span>
                          <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                            <div className="h-full rounded-full" style={{ width: `${d.pct}%`, background: boxColor[d.kind] }} />
                          </div>
                          <span className="w-10 shrink-0 text-right text-[13px] font-semibold tabular-nums text-ink">{d.pct}%</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[12.5px] text-ink-soft">検出対象はありませんでした。</p>
                  )}
                </div>
                {/* 判定 */}
                <div className="grid grid-cols-1 gap-y-2.5 text-[13.5px]">
                  <Cand label="認識結果" value={c.認識結果 ?? '—'} strong />
                  <Cand label="工種判定" value={c.工種判定 ?? '—'} />
                  <Cand label="工程判定" value={c.工程判定 ?? '—'} />
                  <Cand label="設備判定" value={c.設備判定 ?? '—'} />
                  <Cand label="現場判定" value={c.現場判定 ?? '—'} />
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-line pt-3">
                <button className="btn-primary" disabled={isReflected} onClick={() => onReflect(target.id, c)}>
                  <CheckCircle2 size={15} />認識結果を写真情報へ反映
                </button>
                {isReflected ? <Badge tone="ok" dot>反映済み</Badge> : <Badge tone="warn" dot>未反映</Badge>}
              </div>
            </>
          )}
        </div>
      </div>
    </Panel>
  )
}

// モデル状態の表示（実学習済みが未配置のときは「実AIが完成」に見せない）。
// DEMO/seed 等の内部状態は表示せず、実運用向けの表記に統一する。
function modelNote(ai: ReturnType<typeof usePhotoAi>['data']): { text: string; tone: 'ok' | 'warn' | 'info' } | null {
  if (!ai || ai.source === 'none') return null
  const status = (ai.modelStatus ?? '').toUpperCase()
  if (status === 'ACTIVE') return { text: `${ai.model ?? 'AIモデル'}（${ai.modelVersion ?? '-'}）`, tone: 'ok' }
  if (status === 'MODEL_NOT_AVAILABLE') return { text: 'AIモデル未設定', tone: 'warn' }
  return { text: 'AI解析結果', tone: 'info' }
}

function Cand({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div>
      <p className="text-[11.5px] text-ink-soft">{label}</p>
      <p className={`mt-0.5 ${strong ? 'text-[15px] font-bold text-sysken-700' : 'font-medium text-ink'}`}>{value}</p>
    </div>
  )
}

function PhotoCard({ photo, onOpen, onFav, selected, onSelect }: { photo: Photo; onOpen: () => void; onFav: () => void; selected?: boolean; onSelect?: () => void }) {
  return (
    <div data-photo-id={photo.id}
      className={`group relative overflow-hidden rounded border bg-white ${selected ? 'border-sysken-500 ring-1 ring-sysken-300' : 'border-line'}`}>
      {onSelect && (
        <input type="checkbox" checked={selected} onChange={onSelect} className="absolute left-2 top-2 z-10 h-4 w-4 accent-sysken-500" onClick={(e) => e.stopPropagation()} />
      )}
      <button onClick={onFav} className="absolute right-2 top-2 z-10 rounded bg-white/80 p-0.5">
        <Star size={15} className={photo.favorite ? 'fill-warn text-warn' : 'text-slate-400'} />
      </button>
      <div className="aspect-[4/3] cursor-pointer" onClick={onOpen}>
        <PhotoImage url={photo.thumbUrl ?? photo.imageUrl} type={photo.colorKey} no={photo.no} className="h-full w-full" indoor={photo.place.includes('局舎') || photo.place.includes('MDF')} board={{ process: photo.process, date: photo.takenAt }} />
      </div>
      <div className="p-2.5">
        <div className="flex items-center justify-between">
          <span className="text-[12px] font-medium tabular-nums text-ink-soft">{photo.no}</span>
          <StatusBadge status={photo.confirm} />
        </div>
        <p className="mt-1 truncate text-[13px] font-medium text-ink">{photo.process}</p>
        <p className="truncate text-[12px] text-ink-soft">{photo.takenAt} / {photo.photographer}</p>
      </div>
    </div>
  )
}

function PhotoGrid({ photos, onOpen, onFav, selected, onSelect }: { photos: Photo[]; onOpen: (i: number) => void; onFav: (id: string) => void; selected: Set<string>; onSelect: (id: string) => void }) {
  return (
    <div className="grid grid-cols-6 gap-3">
      {photos.map((p, i) => (
        <PhotoCard key={p.id} photo={p} onOpen={() => onOpen(i)} onFav={() => onFav(p.id)} selected={selected.has(p.id)} onSelect={() => onSelect(p.id)} />
      ))}
    </div>
  )
}

function GroupedGrid({ photos, groupBy, onOpen, onFav }: { photos: Photo[]; groupBy: ViewMode; onOpen: (p: Photo) => void; onFav: (id: string) => void }) {
  const keyOf = (p: Photo) => (groupBy === 'process' ? p.process : groupBy === 'date' ? p.takenAt.slice(0, 10) : p.equipment)
  const groups = useMemo(() => {
    const m = new Map<string, Photo[]>()
    photos.forEach((p) => {
      const k = keyOf(p)
      if (!m.has(k)) m.set(k, [])
      m.get(k)!.push(p)
    })
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photos, groupBy])
  return (
    <div className="space-y-4">
      {groups.map(([k, list]) => (
        <div key={k}>
          <div className="mb-2 flex items-center gap-2">
            <h3 className="text-[13px] font-semibold text-ink">{k}</h3>
            <Badge tone="info">{list.length}枚</Badge>
          </div>
          <div className="grid grid-cols-6 gap-3">
            {list.map((p) => (
              <PhotoCard key={p.id} photo={p} onOpen={() => onOpen(p)} onFav={() => onFav(p.id)} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function PhotoTable({ photos, onOpen, onFav, selected, onSelect }: { photos: Photo[]; onOpen: (p: Photo) => void; onFav: (id: string) => void; selected: Set<string>; onSelect: (id: string) => void }) {
  return (
    <Panel bodyClassName="p-0" className="overflow-hidden">
      <div className="thin-scroll overflow-x-auto">
        <table className="grid-table text-[13px]">
          <thead className="bg-canvas text-[12.5px] text-ink-soft">
            <tr>
              {['', '写真', '写真番号', '撮影日時', '撮影者', '撮影場所', '工種', '工程', '設備', 'タグ', '確認状況', ''].map((h) => (
                <th key={h} className="px-3 py-2 text-left font-semibold">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {photos.map((p) => (
              <tr key={p.id} data-photo-id={p.id} className="hover:bg-canvas">
                <td className="px-3"><input type="checkbox" checked={selected.has(p.id)} onChange={() => onSelect(p.id)} className="h-4 w-4 accent-sysken-500" /></td>
                <td className="py-1.5 pl-3"><div className="h-10 w-14 cursor-pointer overflow-hidden rounded" onClick={() => onOpen(p)}><PhotoImage url={p.thumbUrl ?? p.imageUrl} type={p.colorKey} className="h-full w-full" /></div></td>
                <td className="px-3 tabular-nums text-ink-soft">{p.no}</td>
                <td className="px-3 tabular-nums text-ink-soft">{p.takenAt}</td>
                <td className="px-3">{p.photographer}</td>
                <td className="px-3 text-ink-soft">{p.place}</td>
                <td className="px-3">{p.workType}</td>
                <td className="px-3">{p.process}</td>
                <td className="px-3">{p.equipment}</td>
                <td className="px-3"><div className="flex flex-wrap gap-1">{p.tags.slice(0, 2).map((t) => <Badge key={t} tone="muted">{t}</Badge>)}</div></td>
                <td className="px-3"><StatusBadge status={p.confirm} /></td>
                <td className="px-3"><button onClick={() => onFav(p.id)}><Star size={15} className={p.favorite ? 'fill-warn text-warn' : 'text-slate-300'} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  )
}

function Lightbox({ photo, projectLabel, hasPrev, hasNext, reflected, onReflect, onPrev, onNext, onClose, onFav, onConfirm, onComment, onDelete }: {
  photo: Photo; projectLabel: string; hasPrev: boolean; hasNext: boolean; reflected: boolean; onReflect: (recog: Partial<Recognition>) => void
  onPrev: () => void; onNext: () => void; onClose: () => void
  onFav: () => void; onConfirm: (v: Photo['confirm']) => void; onComment: (text: string) => void; onDelete: () => void
}) {
  const { toast } = useApp()
  const feedbackMut = usePredictionFeedback()
  const missedMut = useReportMissed()
  const [comment, setComment] = useState(photo.comment)
  const [showBoxes, setShowBoxes] = useState(true)
  const { data: ai, isLoading: aiLoading } = usePhotoAi(photo.id)
  useEffect(() => setComment(photo.comment), [photo])
  const indoor = photo.place.includes('局舎') || photo.place.includes('MDF')
  // AI推論結果はAPI(ai_predictions)のみ。無ければEmpty State（固定推定は行わない）。
  const useApi = !!ai && ai.source !== 'none'
  const cls: Partial<Recognition> = ai?.recognition ?? {}
  const detections = useApi ? ai!.detections : []
  const boxes = useApi ? ai!.boxes : []
  const judge = qualityJudgeFor(photo)
  const note = modelNote(ai)
  function sendFeedback(predictionId: number | null | undefined, verdict: 'correct' | 'reclassify' | 'false_positive') {
    if (!predictionId) { toast('この結果はフィードバック対象外です', 'warn'); return }
    const corrected = verdict === 'reclassify' ? (window.prompt('正しい設備名を入力') ?? undefined) : undefined
    if (verdict === 'reclassify' && !corrected) return
    feedbackMut.mutate({ photoId: photo.id, predictionId, verdict, corrected_label: corrected }, {
      onSuccess: () => toast('フィードバックを保存しました（AI結果は保持）', 'ok'),
      onError: () => toast('フィードバックの保存に失敗しました', 'ng'),
    })
  }
  function reportMissed() {
    const label = window.prompt('未検出だった設備名を入力') ?? ''
    if (!label) return
    missedMut.mutate({ photoId: photo.id, label }, {
      onSuccess: () => toast('未検出を報告しました', 'ok'),
      onError: () => toast('報告に失敗しました', 'ng'),
    })
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-ink/60" onClick={onClose} />
      <div className="relative z-10 flex max-h-[92vh] w-[1120px] overflow-hidden rounded bg-white shadow-pop">
        {/* 画像 */}
        <div className="relative flex-1 bg-ink/90">
          <PhotoImage url={photo.imageUrl ?? photo.thumbUrl} type={photo.colorKey} no={photo.no} className="h-full max-h-[92vh] w-full" indoor={indoor} board={{ process: photo.process, date: photo.takenAt }} />
          {useApi && showBoxes && <RecognitionOverlay boxes={boxes} />}
          {hasPrev && <button onClick={onPrev} className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-white/85 p-2 hover:bg-white"><ChevronLeft size={22} /></button>}
          {hasNext && <button onClick={onNext} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-white/85 p-2 hover:bg-white"><ChevronRight size={22} /></button>}
          {useApi && (
            <button onClick={() => setShowBoxes((v) => !v)} className="absolute right-3 top-3 rounded border border-white/40 bg-ink/60 px-2 py-1 text-[12px] text-white hover:bg-ink/80">
              {showBoxes ? '認識結果を非表示' : '認識結果を表示'}
            </button>
          )}
        </div>
        {/* 情報 */}
        <div className="thin-scroll flex w-96 shrink-0 flex-col overflow-y-auto border-l border-line">
          <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
            <span className="text-[14px] font-semibold">{photo.no}</span>
            <div className="flex items-center gap-1">
              <button onClick={onFav}><Star size={17} className={photo.favorite ? 'fill-warn text-warn' : 'text-slate-400'} /></button>
              <button onClick={onClose} className="text-ink-soft hover:text-ink">✕</button>
            </div>
          </div>
          {/* AI画像認識結果 */}
          <div className="border-b border-line px-4 py-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[13px] font-semibold text-sysken-700">AI画像認識結果</p>
              {note && <Badge tone={note.tone}>{note.text}</Badge>}
            </div>
            {!useApi ? (
              <p className="rounded border border-dashed border-line bg-canvas px-3 py-4 text-center text-[12.5px] text-ink-soft">
                {aiLoading ? 'AI解析結果を確認しています…' : 'この写真のAI解析結果はまだありません。'}
              </p>
            ) : (
              <>
                <p className="mb-1 text-[11.5px] text-ink-soft">物体検出結果（正しくない場合は下のボタンで訂正）</p>
                {detections.length ? (
                  <div className="space-y-2">
                    {detections.map((d, i) => {
                      const pid = (d as { predictionId?: number | null }).predictionId ?? null
                      const fb = (d as { feedback?: string | null }).feedback ?? null
                      return (
                        <div key={`${d.label}-${i}`}>
                          <div className="flex items-center gap-2">
                            <span className="w-24 shrink-0 text-[13px] text-ink">{d.label}</span>
                            <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                              <div className="h-full rounded-full" style={{ width: `${d.pct}%`, background: boxColor[d.kind] }} />
                            </div>
                            <span className="w-10 shrink-0 text-right text-[13px] font-semibold tabular-nums text-ink">{d.pct}%</span>
                          </div>
                          <div className="mt-0.5 flex items-center gap-1 pl-24 text-[11px]">
                            {fb ? (
                              <Badge tone={fb === 'correct' ? 'ok' : 'warn'}>
                                {fb === 'correct' ? '正しい' : fb === 'reclassify' ? 'クラス修正' : '誤検出'}
                              </Badge>
                            ) : (
                              <>
                                <button className="rounded border border-line px-1.5 py-0.5 hover:bg-canvas" onClick={() => sendFeedback(pid, 'correct')}>正しい</button>
                                <button className="rounded border border-line px-1.5 py-0.5 hover:bg-canvas" onClick={() => sendFeedback(pid, 'reclassify')}>クラス修正</button>
                                <button className="rounded border border-line px-1.5 py-0.5 text-ng hover:bg-red-50" onClick={() => sendFeedback(pid, 'false_positive')}>誤検出</button>
                              </>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <p className="text-[12.5px] text-ink-soft">検出対象はありませんでした。</p>
                )}
                <button className="btn-default btn-xs mt-2 w-full justify-center" onClick={reportMissed}>未検出を報告</button>
                <dl className="mt-2.5 space-y-1.5 text-[13px]">
                  <Row label="工程判定" value={cls.工程判定 ?? '—'} />
                  <Row label="設備判定" value={cls.設備判定 ?? '—'} />
                  <Row label="品質判定" value={<span className={`font-medium ${judge === '良好' ? 'text-ok' : judge === '要修正' ? 'text-ng' : 'text-warn'}`}>{judge}</span>} />
                </dl>
              </>
            )}
          </div>

          <dl className="space-y-2 px-4 py-3 text-[13px]">
            <Row label="撮影日時" value={photo.takenAt} />
            <Row label="撮影者" value={photo.photographer} />
            <Row label="案件名" value={projectLabel} />
            <Row label="工種" value={photo.workType} />
            <Row label="工程" value={photo.process} />
            <Row label="設備" value={photo.equipment} />
            <Row label="認識結果" value={<span className="font-medium text-sysken-700">{cls.認識結果 ?? '—'}</span>} />
            <Row label="反映状況" value={reflected ? <Badge tone="ok" dot>反映済み</Badge> : <Badge tone="warn" dot>未反映</Badge>} />
            <Row label="確認状況" value={<StatusBadge status={photo.confirm} />} />
            <Row label="GPS" value={<span className="flex items-center gap-1 text-ink-soft"><MapPin size={13} />{photo.gps}</span>} />
            <Row label="タグ" value={<div className="flex flex-wrap justify-end gap-1">{photo.tags.map((t) => <Badge key={t} tone="muted">{t}</Badge>)}</div>} />
          </dl>

          {/* 反映＋コメント */}
          <div className="border-t border-line px-4 py-3">
            <button className="btn-primary w-full justify-center" disabled={reflected || !useApi} onClick={() => onReflect(cls)}>
              <CheckCircle2 size={15} />認識結果を反映
            </button>
            <label className="label mt-3">担当者コメント</label>
            <textarea className="field h-16 resize-none" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="コメントを入力..." />
            <button className="btn-default btn-xs mt-1.5 w-full justify-center" onClick={() => onComment(comment)}>コメントを保存</button>
          </div>

          <div className="mt-auto space-y-1.5 border-t border-line px-4 py-3">
            <button className="btn-primary w-full justify-center" onClick={() => onConfirm('確認済み')}><CheckCircle2 size={15} />確認済みにする</button>
            <button className="btn-danger w-full justify-center" onClick={() => onConfirm('再撮影依頼')}>再撮影を依頼</button>
            <button className="btn-ghost w-full justify-center text-ng" onClick={onDelete}><Trash2 size={15} />削除</button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="flex justify-between gap-3"><dt className="shrink-0 text-ink-soft">{label}</dt><dd className="text-right text-ink">{value}</dd></div>
}
