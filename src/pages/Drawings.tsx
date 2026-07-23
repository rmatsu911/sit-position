import { useState } from 'react'
import {
  ZoomIn, ZoomOut, RotateCw, Maximize2, ChevronLeft, ChevronRight, Layers,
  MapPin, MessageSquare, StickyNote, Highlighter, Square, Printer, Download, GitCompare,
} from 'lucide-react'
import { PageHeader } from '../components/layout/Breadcrumb'
import { Panel } from '../components/ui/common'
import { StatusBadge } from '../components/ui/Badge'
import { useApp } from '../context/AppContext'
import { useDocuments } from '../api/documents'

const pins = [
  { x: 30, y: 32, label: 'クロージャ位置確認' },
  { x: 62, y: 55, label: '余長ボックス' },
  { x: 45, y: 72, label: '融着点 12芯' },
]

export default function Drawings() {
  const { toast } = useApp()
  const { data: drawings = [], isLoading } = useDocuments()
  const [current, setCurrent] = useState<string | null>(null)
  const [zoom, setZoom] = useState(1)
  const [rotate, setRotate] = useState(0)
  const [page, setPage] = useState(1)
  const [showPins, setShowPins] = useState(true)
  const [showLayers, setShowLayers] = useState(true)
  const dwg = drawings.find((d) => d.id === current) ?? drawings[0]

  const tools = [
    { icon: ZoomIn, label: '拡大', onClick: () => setZoom((z) => Math.min(2.5, z + 0.2)) },
    { icon: ZoomOut, label: '縮小', onClick: () => setZoom((z) => Math.max(0.5, z - 0.2)) },
    { icon: RotateCw, label: '回転', onClick: () => setRotate((r) => (r + 90) % 360) },
    { icon: Maximize2, label: '全体表示', onClick: () => { setZoom(1); setRotate(0) } },
    { icon: Layers, label: 'レイヤー', onClick: () => setShowLayers((v) => !v) },
    { icon: MapPin, label: 'ピン追加', onClick: () => { setShowPins(true); toast('ピンを追加しました（デモ）', 'ok') } },
    { icon: MessageSquare, label: 'コメント', onClick: () => toast('コメントを追加しました（デモ）', 'ok') },
    { icon: StickyNote, label: '付箋', onClick: () => toast('付箋を追加しました（デモ）', 'ok') },
    { icon: Highlighter, label: 'マーカー', onClick: () => toast('マーカーツール（デモ）') },
    { icon: Square, label: '矩形選択', onClick: () => toast('矩形選択ツール（デモ）') },
    { icon: GitCompare, label: '版比較', onClick: () => toast('版比較を開きます（デモ）') },
    { icon: Printer, label: '印刷', onClick: () => toast('印刷（デモ）') },
    { icon: Download, label: 'ダウンロード', onClick: () => toast('図面をダウンロード（デモ）') },
  ]

  return (
    <div>
      <PageHeader breadcrumb={[{ label: '図面' }]} title="図面" description="図面ビューア（PDF風・ピン/コメント付き）" />
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
              <div className="flex items-center gap-2 text-xs text-ink-soft">
                <button onClick={() => setPage((p) => Math.max(1, p - 1))} className="rounded p-1 hover:bg-line/60"><ChevronLeft size={16} /></button>
                <span className="tabular-nums">{page} / 3</span>
                <button onClick={() => setPage((p) => Math.min(3, p + 1))} className="rounded p-1 hover:bg-line/60"><ChevronRight size={16} /></button>
              </div>
            </div>
            <div className="thin-scroll flex items-center justify-center overflow-auto bg-slate-200 p-8" style={{ height: 'calc(100vh - 300px)' }}>
              <div className="relative bg-white shadow-pop" style={{ transform: `scale(${zoom}) rotate(${rotate}deg)`, transition: 'transform 0.15s' }}>
                <DrawingSvg showLayers={showLayers} />
                {showPins && pins.map((p, i) => (
                  <div key={i} className="group absolute -translate-x-1/2 -translate-y-full" style={{ left: `${p.x}%`, top: `${p.y}%` }}>
                    <MapPin size={20} className="fill-ng/20 text-ng" />
                    <div className="absolute left-1/2 top-0 hidden -translate-x-1/2 -translate-y-full whitespace-nowrap rounded bg-ink px-2 py-0.5 text-[11px] text-white group-hover:block">{p.label}</div>
                  </div>
                ))}
              </div>
            </div>
          </Panel>
          )}
        </div>
      </div>
    </div>
  )
}

function DrawingSvg({ showLayers }: { showLayers: boolean }) {
  return (
    <svg width="560" height="400" viewBox="0 0 560 400">
      <rect width="560" height="400" fill="#fff" />
      <rect x="10" y="10" width="540" height="380" fill="none" stroke="#1f2933" strokeWidth="1.5" />
      {/* タイトルブロック */}
      <rect x="360" y="330" width="180" height="50" fill="none" stroke="#1f2933" />
      <line x1="360" y1="347" x2="540" y2="347" stroke="#1f2933" />
      <line x1="360" y1="364" x2="540" y2="364" stroke="#1f2933" />
      <text x="366" y="343" fontSize="8" fill="#1f2933">熊本中央局 局内配線系統図</text>
      <text x="366" y="360" fontSize="7" fill="#667085">図番 DWG-001 / Rev.3</text>
      <text x="366" y="377" fontSize="7" fill="#667085">SYSKEN 施工管理部</text>
      {showLayers && (
        <g stroke="#005bac" strokeWidth="1.5" fill="none">
          {/* MDF/ラック */}
          <rect x="40" y="60" width="60" height="120" />
          <text x="46" y="54" fontSize="9" fill="#005bac">MDF</text>
          <rect x="200" y="80" width="50" height="90" />
          <text x="206" y="74" fontSize="9" fill="#005bac">ラックA</text>
          <rect x="330" y="80" width="50" height="90" />
          <text x="336" y="74" fontSize="9" fill="#005bac">ラックB</text>
          {/* 配線 */}
          <path d="M100 100 L200 100" />
          <path d="M100 130 C150 130 160 120 200 120" />
          <path d="M250 110 L330 110" />
          <path d="M250 140 L330 140" />
          {/* クロージャ */}
          <circle cx="440" cy="130" r="18" stroke="#2e8b57" />
          <text x="420" y="165" fontSize="8" fill="#2e8b57">クロージャC-1</text>
          <path d="M380 130 L422 130" stroke="#2e8b57" />
        </g>
      )}
      <g stroke="#94a3b8" strokeWidth="0.5">
        {Array.from({ length: 10 }).map((_, i) => <line key={`h${i}`} x1="10" y1={40 + i * 30} x2="550" y2={40 + i * 30} strokeDasharray="2 3" />)}
      </g>
    </svg>
  )
}
