import { useMemo, useState, useEffect } from 'react'
import {
  Grid3x3, List as ListIcon, Star, Upload, Download, Trash2, Tag, CheckCircle2,
  ChevronLeft, ChevronRight, Sparkles, MapPin, Camera, Filter,
} from 'lucide-react'
import { PageHeader } from '../components/layout/Breadcrumb'
import { Panel, PreparingTag } from '../components/ui/common'
import { Badge, StatusBadge } from '../components/ui/Badge'
import { Modal } from '../components/ui/Modal'
import { PhotoPlaceholder } from '../components/ui/PhotoPlaceholder'
import { useApp } from '../context/AppContext'
import { photos as seedPhotos, photoTags } from '../data/photos'
import type { Photo } from '../types'

type ViewMode = 'thumb' | 'list' | 'process' | 'date' | 'equip'

export default function Photos() {
  const { toast, confirm } = useApp()
  const [photos, setPhotos] = useState<Photo[]>(() => seedPhotos.map((p) => ({ ...p })))
  const [view, setView] = useState<ViewMode>('thumb')
  const [tagFilter, setTagFilter] = useState<string>('all')
  const [confirmFilter, setConfirmFilter] = useState<string>('all')
  const [onlyFav, setOnlyFav] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [lightbox, setLightbox] = useState<number | null>(null)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [uploadPct, setUploadPct] = useState(0)
  const [aiRunning, setAiRunning] = useState(false)
  const [aiDone, setAiDone] = useState(false)

  const filtered = useMemo(() => {
    return photos.filter((p) => {
      if (tagFilter !== 'all' && !p.tags.includes(tagFilter)) return false
      if (confirmFilter !== 'all' && p.confirm !== confirmFilter) return false
      if (onlyFav && !p.favorite) return false
      return true
    })
  }, [photos, tagFilter, confirmFilter, onlyFav])

  function toggleFav(id: string) {
    setPhotos((prev) => prev.map((p) => (p.id === id ? { ...p, favorite: !p.favorite } : p)))
  }
  function setConfirm(id: string, val: Photo['confirm']) {
    setPhotos((prev) => prev.map((p) => (p.id === id ? { ...p, confirm: val } : p)))
    toast(`写真を「${val}」に変更しました`, 'ok')
  }
  function toggleSelect(id: string) {
    setSelected((prev) => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }

  // アップロードデモ
  function startUpload() {
    setUploadOpen(true)
    setUploadPct(0)
  }
  useEffect(() => {
    if (!uploadOpen) return
    if (uploadPct >= 100) return
    const t = window.setTimeout(() => setUploadPct((p) => Math.min(100, p + 8 + Math.random() * 12)), 180)
    return () => window.clearTimeout(t)
  }, [uploadOpen, uploadPct])
  useEffect(() => {
    if (uploadOpen && uploadPct >= 100) {
      const t = window.setTimeout(() => {
        const n = photos.length + 1
        const newPhoto: Photo = {
          id: `ph-new-${n}`, no: `P-${n.toString().padStart(3, '0')}`, projectId: 'p1',
          takenAt: '2026/07/21 15:20', photographer: '山田 太郎', place: '局舎1F MDF室',
          gps: '32.7900, 130.7400', workType: '接続', process: '接続損失測定', equipment: '融着',
          tags: ['融着', '接続試験'], comment: '', confirm: '未確認', uploaded: true,
          aiCandidate: '融着', favorite: false, colorKey: '融着',
        }
        setPhotos((prev) => [newPhoto, ...prev])
        setUploadOpen(false)
        toast('写真をアップロードしました（デモ）', 'ok')
      }, 500)
      return () => window.clearTimeout(t)
    }
  }, [uploadOpen, uploadPct, photos.length, toast])

  function runAi() {
    setAiRunning(true)
    setAiDone(false)
    window.setTimeout(() => {
      setAiRunning(false)
      setAiDone(true)
    }, 1600)
  }

  const stats = {
    total: photos.length,
    unconfirmed: photos.filter((p) => p.confirm === '未確認').length,
    recheck: photos.filter((p) => p.confirm === '再撮影依頼').length,
    fav: photos.filter((p) => p.favorite).length,
  }

  return (
    <div>
      <PageHeader
        breadcrumb={[{ label: '案件一覧', to: '/projects' }, { label: '熊本中央局 光設備更改工事', to: '/projects/p1' }, { label: '施工写真' }]}
        title="施工写真"
        description={`全 ${stats.total} 枚 ／ 未確認 ${stats.unconfirmed} 枚 ／ 再撮影依頼 ${stats.recheck} 枚 ／ お気に入り ${stats.fav} 枚`}
        actions={
          <>
            <button className="btn-default" onClick={() => selected.size ? toast(`${selected.size}件に一括タグを設定しました（デモ）`, 'ok') : toast('写真を選択してください')}><Tag size={15} />一括タグ</button>
            <button className="btn-default" onClick={() => toast('選択写真をダウンロードします（デモ）')}><Download size={15} />ダウンロード</button>
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

      {/* AI分類バナー */}
      <div className="mb-3 flex items-center justify-between rounded border border-dashed border-sysken-300 bg-sysken-50 px-3 py-2">
        <div className="flex items-center gap-2 text-xs text-sysken-700">
          <Sparkles size={16} />
          <span className="font-medium">AI画像分類</span><PreparingTag />
          <span className="text-ink-soft">分類候補：光ケーブル ／ 信頼度：サンプル表示 ／ 画像解析エンジン：未接続</span>
        </div>
        <button className="btn-default btn-xs" onClick={runAi}>AI分類を実行</button>
      </div>

      {/* 表示本体 */}
      {view === 'list' ? (
        <PhotoTable photos={filtered} onOpen={(p) => setLightbox(filtered.indexOf(p))} onFav={toggleFav} selected={selected} onSelect={toggleSelect} />
      ) : view === 'thumb' ? (
        <PhotoGrid photos={filtered} onOpen={(i) => setLightbox(i)} onFav={toggleFav} selected={selected} onSelect={toggleSelect} />
      ) : (
        <GroupedGrid photos={filtered} groupBy={view} onOpen={(p) => setLightbox(filtered.indexOf(p))} onFav={toggleFav} />
      )}

      {/* ライトボックス */}
      {lightbox !== null && filtered[lightbox] && (
        <Lightbox
          photo={filtered[lightbox]}
          hasPrev={lightbox > 0}
          hasNext={lightbox < filtered.length - 1}
          onPrev={() => setLightbox((i) => (i! > 0 ? i! - 1 : i))}
          onNext={() => setLightbox((i) => (i! < filtered.length - 1 ? i! + 1 : i))}
          onClose={() => setLightbox(null)}
          onFav={() => toggleFav(filtered[lightbox].id)}
          onConfirm={(v) => setConfirm(filtered[lightbox].id, v)}
          onComment={() => toast('コメントを保存しました（デモ）', 'ok')}
          onDelete={async () => {
            const ok = await confirm({ title: '写真の削除', message: 'この写真を削除しますか？', confirmLabel: '削除', danger: true })
            if (ok) { setPhotos((prev) => prev.filter((p) => p.id !== filtered[lightbox].id)); setLightbox(null); toast('写真を削除しました', 'ok') }
          }}
        />
      )}

      {/* アップロードモーダル */}
      <Modal open={uploadOpen} onClose={() => uploadPct >= 100 && setUploadOpen(false)} title="写真アップロード（デモ）"
        footer={<button className="btn-default" disabled={uploadPct < 100} onClick={() => setUploadOpen(false)}>閉じる</button>}>
        <div className="space-y-3">
          <div className="flex flex-col items-center justify-center gap-2 rounded border-2 border-dashed border-line bg-canvas py-8 text-ink-soft">
            <Upload size={28} />
            <p className="text-[13px]">IMG_20260721_1520.jpg をアップロード中...</p>
          </div>
          <div>
            <div className="mb-1 flex justify-between text-xs text-ink-soft"><span>アップロード進捗</span><span>{Math.round(uploadPct)}%</span></div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-sysken-500 transition-all" style={{ width: `${uploadPct}%` }} /></div>
          </div>
        </div>
      </Modal>

      {/* AI実行モーダル */}
      <Modal open={aiRunning || aiDone} onClose={() => { setAiRunning(false); setAiDone(false) }} title="AI画像分類（デモ）"
        footer={aiDone ? <button className="btn-primary" onClick={() => setAiDone(false)}>閉じる</button> : undefined}>
        {aiRunning ? (
          <div className="flex flex-col items-center gap-3 py-8 text-ink-soft">
            <Sparkles size={28} className="animate-pulse text-sysken-500" />
            <p className="text-[13px]">画像を解析しています...</p>
          </div>
        ) : (
          <div className="rounded border border-dashed border-sysken-300 bg-sysken-50 p-4 text-[13px] text-sysken-800">
            デモ環境のため、AI画像分類は実行されません。将来的には設備種別、工程、写真不足、重複写真などを自動判定する予定です。
          </div>
        )}
      </Modal>
    </div>
  )
}

function PhotoCard({ photo, onOpen, onFav, selected, onSelect }: { photo: Photo; onOpen: () => void; onFav: () => void; selected?: boolean; onSelect?: () => void }) {
  return (
    <div className={`group relative overflow-hidden rounded border bg-white ${selected ? 'border-sysken-500 ring-1 ring-sysken-300' : 'border-line'}`}>
      {onSelect && (
        <input type="checkbox" checked={selected} onChange={onSelect} className="absolute left-2 top-2 z-10 h-4 w-4 accent-sysken-500" onClick={(e) => e.stopPropagation()} />
      )}
      <button onClick={onFav} className="absolute right-2 top-2 z-10 rounded bg-white/80 p-0.5">
        <Star size={15} className={photo.favorite ? 'fill-warn text-warn' : 'text-slate-400'} />
      </button>
      <div className="aspect-[4/3] cursor-pointer" onClick={onOpen}>
        <PhotoPlaceholder type={photo.colorKey} no={photo.no} className="h-full w-full" indoor={photo.place.includes('局舎') || photo.place.includes('MDF')} />
      </div>
      <div className="p-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-medium tabular-nums text-ink-soft">{photo.no}</span>
          <StatusBadge status={photo.confirm} />
        </div>
        <p className="mt-1 truncate text-xs text-ink">{photo.process}</p>
        <p className="truncate text-[11px] text-ink-soft">{photo.takenAt} / {photo.photographer}</p>
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
          <thead className="bg-canvas text-xs text-ink-soft">
            <tr>
              {['', '写真', '写真番号', '撮影日時', '撮影者', '撮影場所', '工種', '工程', '設備', 'タグ', '確認状況', ''].map((h) => (
                <th key={h} className="px-3 py-2 text-left font-semibold">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {photos.map((p) => (
              <tr key={p.id} className="hover:bg-canvas">
                <td className="px-3"><input type="checkbox" checked={selected.has(p.id)} onChange={() => onSelect(p.id)} className="h-4 w-4 accent-sysken-500" /></td>
                <td className="py-1.5 pl-3"><div className="h-10 w-14 cursor-pointer overflow-hidden rounded" onClick={() => onOpen(p)}><PhotoPlaceholder type={p.colorKey} className="h-full w-full" /></div></td>
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

function Lightbox({ photo, hasPrev, hasNext, onPrev, onNext, onClose, onFav, onConfirm, onComment, onDelete }: {
  photo: Photo; hasPrev: boolean; hasNext: boolean; onPrev: () => void; onNext: () => void; onClose: () => void
  onFav: () => void; onConfirm: (v: Photo['confirm']) => void; onComment: () => void; onDelete: () => void
}) {
  const [comment, setComment] = useState(photo.comment)
  useEffect(() => setComment(photo.comment), [photo])
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-ink/60" onClick={onClose} />
      <div className="relative z-10 flex max-h-[90vh] w-[1000px] overflow-hidden rounded bg-white shadow-pop">
        {/* 画像 */}
        <div className="relative flex-1 bg-ink/90">
          <PhotoPlaceholder type={photo.colorKey} no={photo.no} className="h-full max-h-[90vh] w-full" indoor={photo.place.includes('局舎') || photo.place.includes('MDF')} />
          {hasPrev && <button onClick={onPrev} className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-white/85 p-2 hover:bg-white"><ChevronLeft size={22} /></button>}
          {hasNext && <button onClick={onNext} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-white/85 p-2 hover:bg-white"><ChevronRight size={22} /></button>}
        </div>
        {/* 情報 */}
        <div className="thin-scroll flex w-80 shrink-0 flex-col overflow-y-auto border-l border-line">
          <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
            <span className="text-[13px] font-semibold">{photo.no}</span>
            <div className="flex items-center gap-1">
              <button onClick={onFav}><Star size={17} className={photo.favorite ? 'fill-warn text-warn' : 'text-slate-400'} /></button>
              <button onClick={onClose} className="text-ink-soft hover:text-ink">✕</button>
            </div>
          </div>
          <dl className="space-y-2 px-4 py-3 text-[13px]">
            <Row label="撮影日時" value={photo.takenAt} />
            <Row label="撮影者" value={photo.photographer} />
            <Row label="撮影場所" value={photo.place} />
            <Row label="GPS" value={<span className="flex items-center gap-1 text-ink-soft"><MapPin size={13} />{photo.gps}</span>} />
            <Row label="工種" value={photo.workType} />
            <Row label="工程" value={photo.process} />
            <Row label="設備" value={photo.equipment} />
            <Row label="タグ" value={<div className="flex flex-wrap gap-1">{photo.tags.map((t) => <Badge key={t} tone="muted">{t}</Badge>)}</div>} />
            <Row label="確認状況" value={<StatusBadge status={photo.confirm} />} />
          </dl>
          <div className="border-t border-line px-4 py-3">
            <div className="mb-2 flex items-center gap-1.5 rounded border border-dashed border-sysken-300 bg-sysken-50 px-2 py-1 text-[11px] text-sysken-700">
              <Sparkles size={13} />AI分類：{photo.aiCandidate}（準備中・サンプル）
            </div>
            <label className="label">コメント</label>
            <textarea className="field h-16 resize-none" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="コメントを入力..." />
            <button className="btn-default btn-xs mt-1.5 w-full justify-center" onClick={onComment}>コメントを保存</button>
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
