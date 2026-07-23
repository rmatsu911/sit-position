import { useMemo, useState } from 'react'
import { ScanSearch, CheckCircle2, RotateCcw, PauseCircle, ArrowRight } from 'lucide-react'
import { PageHeader } from '../components/layout/Breadcrumb'
import { Panel } from '../components/ui/common'
import { StatusBadge, Badge } from '../components/ui/Badge'
import { Modal } from '../components/ui/Modal'
import { PhotoPlaceholder } from '../components/ui/PhotoPlaceholder'
import { useApp } from '../context/AppContext'
import { anomalyFindings, anomalyMeta, detectionPoints } from '../data/quality'
import { useQualityChecks, useUpdateQualityCheck } from '../api/quality'
import { usePhotos } from '../api/photos'
import type { QualityItem, QualityStatus } from '../types'

const flow = ['写真登録', 'AI画像認識', '品質確認', 'コメント入力', '修正・再撮影依頼', '再確認', '承認']

export default function Quality() {
  const { toast } = useApp()
  const { data: items = [], isLoading, isError, refetch } = useQualityChecks()
  const { data: photos = [] } = usePhotos()
  const updateMut = useUpdateQualityCheck()
  const [detail, setDetail] = useState<QualityItem | null>(null)
  const [anomalyOpen, setAnomalyOpen] = useState(false)
  const [comment, setComment] = useState('')
  const [anomalyStatus, setAnomalyStatus] = useState('確認待ち')

  const photoById = useMemo(() => new Map(photos.map((p) => [p.id, p])), [photos])

  function act(id: string, status: QualityStatus, msg: string) {
    updateMut.mutate(
      { id, status, comment: comment || undefined },
      {
        onSuccess: () => { toast(msg, 'ok'); setDetail(null); setComment('') },
        onError: () => toast('保存に失敗しました', 'ng'),
      },
    )
  }

  const summary = useMemo(() => {
    const count = (s: string) => items.filter((q) => q.status === s).length
    return {
      確認待ち: count('確認待ち'), 不足: count('情報不足'), 未提出: count('未提出'), 警告: count('警告'),
      確認済み: count('確認済み'), 再撮影依頼: count('再撮影依頼'), 承認済み: count('承認済み'),
    }
  }, [items])

  const summaryTiles: { label: string; value: number; tone: 'warn' | 'ng' | 'ok' | 'info' }[] = [
    { label: '確認待ち', value: summary.確認待ち, tone: 'warn' },
    { label: '不足', value: summary.不足, tone: 'warn' },
    { label: '未提出', value: summary.未提出, tone: 'ng' },
    { label: '警告', value: summary.警告, tone: 'warn' },
    { label: '確認済み', value: summary.確認済み, tone: 'ok' },
    { label: '再撮影依頼', value: summary.再撮影依頼, tone: 'ng' },
    { label: '承認済み', value: summary.承認済み, tone: 'ok' },
  ]

  return (
    <div>
      <PageHeader
        breadcrumb={[{ label: '品質管理' }]}
        title="品質管理"
        description="施工写真・検査項目の確認と承認"
        actions={<button className="btn-default" onClick={() => setAnomalyOpen(true)}><ScanSearch size={15} />AI品質チェック</button>}
      />

      {/* 集計 */}
      <div className="mb-3 grid grid-cols-7 gap-2">
        {summaryTiles.map((t) => (
          <div key={t.label} className="rounded border border-line bg-white px-3 py-2.5 text-center shadow-panel">
            <p className={`text-2xl font-bold ${t.tone === 'ng' ? 'text-ng' : t.tone === 'warn' ? 'text-warn' : t.tone === 'ok' ? 'text-ok' : 'text-sysken-600'}`}>{t.value}</p>
            <p className="mt-0.5 text-[11px] text-ink-soft">{t.label}</p>
          </div>
        ))}
      </div>

      {/* 業務フロー */}
      <Panel title="品質確認フロー" className="mb-3">
        <div className="flex flex-wrap items-center gap-1">
          {flow.map((f, i) => (
            <div key={f} className="flex items-center gap-1">
              <span className={`rounded px-2.5 py-1 text-xs ${i === 2 ? 'bg-sysken-500 font-medium text-white' : 'bg-canvas text-ink-soft'}`}>{f}</span>
              {i < flow.length - 1 && <ArrowRight size={14} className="text-slate-300" />}
            </div>
          ))}
        </div>
      </Panel>

      {/* 読込・エラー・空 状態 */}
      {isLoading && <div className="rounded border border-line bg-white px-4 py-10 text-center text-[13px] text-ink-soft">品質チェックを読み込んでいます…</div>}
      {isError && (
        <div className="rounded border border-red-200 bg-red-50 px-4 py-6 text-center text-[13px] text-ng">
          品質チェックの取得に失敗しました。<button className="ml-2 underline" onClick={() => refetch()}>再試行</button>
        </div>
      )}
      {!isLoading && !isError && items.length === 0 && (
        <div className="rounded border border-line bg-white px-4 py-10 text-center text-[13px] text-ink-soft">品質チェックはまだ登録されていません。</div>
      )}

      {/* 一覧 */}
      {!isLoading && !isError && items.length > 0 && (
      <Panel bodyClassName="p-0" className="overflow-hidden">
        <div className="thin-scroll overflow-x-auto">
          <table className="grid-table text-[13px]">
            <thead className="bg-canvas text-[12.5px] text-ink-soft">
              <tr>
                {['対象写真', '案件', '工程', '検査項目', '判定', 'コメント', '担当者', '確認者', '対応期限', 'ステータス', ''].map((h) => (
                  <th key={h} className="px-3 py-2 text-left font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((q) => {
                const ph = photoById.get(q.photoId)
                return (
                  <tr key={q.id} className="cursor-pointer hover:bg-canvas" onClick={() => { setDetail(q); setComment('') }}>
                    <td className="py-1.5 pl-3"><div className="h-10 w-14 overflow-hidden rounded">{ph ? <PhotoPlaceholder type={ph.colorKey} className="h-full w-full" /> : '—'}</div></td>
                    <td className="px-3 text-ink-soft">{q.projectId === 'p1' ? '熊本中央局' : q.projectId === 'p3' ? '菊陽町' : '玉名局'}</td>
                    <td className="px-3">{q.process}</td>
                    <td className="px-3">{q.inspectItem}</td>
                    <td className="px-3"><StatusBadge status={q.judge} /></td>
                    <td className="max-w-[220px] truncate px-3 text-ink-soft">{q.comment || '—'}</td>
                    <td className="px-3 text-ink-soft">{q.worker}</td>
                    <td className="px-3 text-ink-soft">{q.checker}</td>
                    <td className="px-3 tabular-nums text-ink-soft">{q.dueDate.slice(5)}</td>
                    <td className="px-3"><StatusBadge status={q.status} /></td>
                    <td className="px-3 text-sysken-600">詳細</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Panel>
      )}

      {/* 詳細モーダル */}
      <Modal open={!!detail} onClose={() => setDetail(null)} title={detail ? `品質確認：${detail.inspectItem}` : ''} size="lg"
        footer={detail && (
          <>
            <button className="btn-default" onClick={() => act(detail.id, '確認済み', '保留にしました')}><PauseCircle size={15} />保留</button>
            <button className="btn-danger" onClick={() => act(detail.id, '再撮影依頼', '再撮影を依頼しました')}><RotateCcw size={15} />再撮影依頼</button>
            <button className="btn-primary" onClick={() => act(detail.id, '承認済み', '承認しました')}><CheckCircle2 size={15} />承認</button>
          </>
        )}>
        {detail && (() => {
          const ph = photoById.get(detail.photoId)
          return (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="overflow-hidden rounded border border-line">
                  {ph ? <PhotoPlaceholder type={ph.colorKey} no={ph.no} className="aspect-[4/3] w-full" /> : null}
                </div>
                <div className="mt-2 flex items-center gap-1.5 rounded border border-sysken-200 bg-sysken-50 px-2 py-1 text-[12px] text-sysken-700">
                  <span className="font-medium">AI認識結果：{ph?.aiCandidate}</span>
                </div>
              </div>
              <div className="space-y-3 text-[13px]">
                <KV label="工程" value={detail.process} />
                <KV label="検査項目" value={detail.inspectItem} />
                <KV label="判定" value={<StatusBadge status={detail.judge} />} />
                <KV label="担当者" value={detail.worker} />
                <KV label="品質担当者" value={detail.checker} />
                <KV label="対応期限" value={detail.dueDate} />
                <div>
                  <p className="mb-1 text-xs font-semibold text-ink-soft">過去コメント</p>
                  <p className="rounded border border-line bg-canvas px-2 py-1.5 text-ink">{detail.comment || 'コメントはありません'}</p>
                </div>
                <div>
                  <label className="label">担当者コメント</label>
                  <textarea className="field h-16 resize-none" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="確認コメントを入力..." />
                </div>
              </div>
            </div>
          )
        })()}
      </Modal>

      {/* AI施工品質チェック */}
      <Modal open={anomalyOpen} onClose={() => setAnomalyOpen(false)} title="AI施工品質チェック" size="xl"
        footer={
          <div className="flex w-full items-center justify-between">
            <div className="flex items-center gap-2 text-[12.5px] text-ink-soft">確認状況：<StatusBadge status={anomalyStatus} /></div>
            <div className="flex items-center gap-2">
              <button className="btn-default" onClick={() => { setAnomalyStatus('確認済み'); toast('問題なしとして確認しました', 'ok') }}>問題なし</button>
              <button className="btn-default" onClick={() => toast('コメントを追加しました', 'ok')}>コメントを追加</button>
              <button className="btn-danger" onClick={() => { setAnomalyStatus('再撮影依頼'); toast('再撮影を依頼しました', 'ng') }}>再撮影を依頼</button>
              <button className="btn-default" onClick={() => { setAnomalyStatus('再撮影依頼'); toast('修正を依頼しました', 'ng') }}>修正を依頼</button>
              <button className="btn-default" onClick={() => { setAnomalyStatus('保留'); toast('保留にしました', 'warn') }}>保留</button>
              <button className="btn-primary" onClick={() => { setAnomalyStatus('承認済み'); toast('承認しました', 'ok') }}>承認</button>
            </div>
          </div>
        }>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="mb-1.5 text-[14px] font-semibold text-ink">確認対象写真</p>
            <div className="relative overflow-hidden rounded border border-line">
              <PhotoPlaceholder type="クロージャ" no={anomalyMeta.photoNo} className="aspect-[4/3] w-full" board={{ process: anomalyMeta.process, date: anomalyMeta.takenAt }} />
              <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 75" preserveAspectRatio="none">
                {anomalyFindings.map((a) => (
                  <g key={a.no}>
                    <rect x={a.x} y={a.y} width={a.w} height={a.h} fill="#d64545" fillOpacity={0.08} stroke="#d64545" strokeWidth={1} rx={1} />
                    <circle cx={a.x} cy={a.y} r="3.4" fill="#d64545" />
                    <text x={a.x} y={a.y + 1.2} fontSize="3.6" fill="#fff" textAnchor="middle" fontWeight="bold">{a.no}</text>
                    <rect x={a.x + 4.5} y={a.y - 2.6} width={a.label.length * 3.4 + 3} height={5} rx={1} fill="#d64545" />
                    <text x={a.x + 6} y={a.y + 1.1} fontSize="3.2" fill="#fff">{a.label}</text>
                  </g>
                ))}
              </svg>
              <span className="absolute bottom-1 left-1 rounded bg-ink/70 px-1.5 py-0.5 text-[10px] text-white">AI検出結果</span>
            </div>
          </div>
          <div>
            <p className="mb-1.5 text-[14px] font-semibold text-ink">完成基準写真</p>
            <div className="overflow-hidden rounded border border-line">
              <PhotoPlaceholder type="完成状態" no="基準" className="aspect-[4/3] w-full" board={{ process: 'クロージャ設置（完成基準）', date: '基準' }} />
            </div>
            <div className="mt-2 flex items-center gap-2">
              <Badge tone="ok" dot>完成基準</Badge>
              <span className="text-[13px] text-ink-soft">比較用の完成基準写真</span>
            </div>
          </div>
        </div>

        {/* AI検出結果 */}
        <div className="mt-3 rounded border border-line bg-canvas px-4 py-3">
          <p className="mb-1.5 text-[13px] font-semibold text-ink">AI検出結果</p>
          <div className="flex flex-wrap gap-2">
            {detectionPoints.map((p, i) => (
              <span key={p} className="inline-flex items-center gap-1.5 rounded border border-red-200 bg-red-50 px-2.5 py-1 text-[13px] text-ng">
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-ng text-[10px] font-bold text-white">{i + 1}</span>{p}
              </span>
            ))}
          </div>
        </div>

        {/* 詳細情報 */}
        <div className="mt-3 grid grid-cols-5 gap-x-4 gap-y-2 rounded border border-line bg-canvas px-4 py-3 text-[13px]">
          <Meta label="案件名" value={anomalyMeta.project} span={2} />
          <Meta label="工程" value={anomalyMeta.process} />
          <Meta label="設備" value={anomalyMeta.equipment} />
          <Meta label="写真番号" value={anomalyMeta.photoNo} />
          <Meta label="撮影日時" value={anomalyMeta.takenAt} />
          <Meta label="撮影者" value={anomalyMeta.photographer} />
          <Meta label="確認担当者" value={anomalyMeta.checker} />
          <Meta label="AI判定結果" value={<span className="font-medium text-ng">{anomalyMeta.judge}</span>} />
          <Meta label="重要度" value={<span className="font-medium text-warn">{anomalyMeta.priority}</span>} />
          <Meta label="確認状況" value={<StatusBadge status={anomalyStatus} />} />
          <Meta label="対応期限" value={anomalyMeta.dueDate} />
        </div>
      </Modal>
    </div>
  )
}

function KV({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="flex justify-between gap-3"><span className="shrink-0 text-ink-soft">{label}</span><span className="text-right text-ink">{value}</span></div>
}

function Meta({ label, value, span }: { label: string; value: React.ReactNode; span?: number }) {
  return (
    <div className={span === 2 ? 'col-span-2' : ''}>
      <p className="text-[11.5px] text-ink-soft">{label}</p>
      <p className="mt-0.5 font-medium text-ink">{value}</p>
    </div>
  )
}
