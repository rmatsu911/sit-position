/**
 * 右側の「AI機能」パネル。
 *
 * 機能ごとに「何をするものか」（構想）と「いまどうなっているか」（状態）を
 * 分けて出す。状態は API が実データ（学習済みモデル・推論ジョブ）から判定した
 * 値だけを表示し、画面側で「実装済み」「接続済み」と決め打ちしない。
 */
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Sparkles, MessageSquareText, X, Info } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import {
  AI_STATUS_LABEL, AI_STATUS_TONE, useAiStatus,
  type AiFeatureState, type AiFeatureStatus,
} from '../../api/ai'
import { aiFeatureDetails, aiPanelHeading, aiPanelIntro } from '../../data/aiPanel'
import { ApiError } from '../../lib/apiClient'
import { Modal } from '../ui/Modal'

const TONE_CLASS: Record<'ok' | 'ng' | 'muted', string> = {
  ok: 'border-emerald-200 bg-emerald-50 text-ok',
  ng: 'border-amber-200 bg-amber-50 text-warn',
  muted: 'border-line bg-canvas text-ink-soft',
}

export function StatusChip({ status }: { status: AiFeatureStatus }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded border px-1.5 py-0.5 text-[11px] font-medium ${TONE_CLASS[AI_STATUS_TONE[status]]}`}
      data-ai-status={status}
    >
      {AI_STATUS_LABEL[status]}
    </span>
  )
}

export function AISupportPanel() {
  const { aiPanelOpen, closeAiPanel } = useApp()
  const navigate = useNavigate()
  const [detail, setDetail] = useState<AiFeatureState | null>(null)
  // パネルを開いているときだけ問い合わせる
  const { data, isLoading, isError, error } = useAiStatus(aiPanelOpen)

  return (
    <aside
      data-print="hide"
      className={`h-full shrink-0 overflow-hidden bg-white transition-[width] duration-150 ${
        aiPanelOpen ? 'w-[320px] border-l border-line' : 'w-0'
      }`}
      aria-hidden={!aiPanelOpen}
    >
      <div className="flex h-full w-[320px] flex-col">
      <header className="flex items-center justify-between border-b border-line bg-gradient-to-r from-sysken-50 to-white px-4 py-3">
        <div className="flex items-center gap-2">
          <Sparkles size={18} className="text-sysken-500" />
          <span className="text-[15px] font-semibold text-sysken-700">{aiPanelHeading}</span>
        </div>
        <button onClick={closeAiPanel} className="rounded p-1 text-ink-soft hover:bg-canvas" title="閉じる">
          <X size={18} />
        </button>
      </header>

      <div className="thin-scroll flex-1 overflow-y-auto p-4">
        <p className="mb-1 text-[14px] font-semibold text-ink">AI機能</p>
        <p className="mb-3 text-[12px] leading-relaxed text-ink-soft">
          {aiPanelIntro}
        </p>

        {isLoading && <p className="text-[12px] text-ink-soft">状態を確認しています…</p>}
        {isError && (
          <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-ng">
            {error instanceof ApiError ? error.message : 'AI機能の状態を取得できませんでした'}
          </p>
        )}

        {data && (
          <div className="space-y-2" data-ai-features>
            {data.features.map((it) => (
              <div key={it.key} className="rounded border border-line px-3 py-2.5" data-ai-feature={it.key}>
                <div className="flex items-start justify-between gap-2">
                  <p className="text-[13.5px] font-medium text-ink">{it.title}</p>
                  <StatusChip status={it.status} />
                </div>
                {it.detail && <p className="mt-1 text-[11.5px] text-ink-soft">{it.detail}</p>}
                <button
                  onClick={() => setDetail(it)}
                  className="mt-1.5 inline-flex items-center gap-1 rounded border border-sysken-200 bg-sysken-50 px-2 py-1 text-[12px] font-medium text-sysken-700 hover:bg-sysken-100"
                >
                  <Info size={13} />
                  機能の詳細
                </button>
              </div>
            ))}
          </div>
        )}

        {data && (
          <div className="mt-3 rounded border border-line bg-canvas px-3 py-2 text-[11.5px] text-ink-soft"
               data-ai-runtime-summary>
            学習済みモデル {data.trained_model_count}件 ／ 処理待ちジョブ {data.pending_jobs}件
            <br />
            最後に成功した推論：{data.last_successful_job_at
              ? data.last_successful_job_at.replace('T', ' ').slice(0, 16)
              : 'まだありません'}
          </div>
        )}

        {/* AI施工判断への導線。未実装であることは上のカードの状態で示している */}
        <button
          onClick={() => navigate('/consultation')}
          className="mt-4 flex w-full items-center gap-2 rounded border border-sysken-200 bg-sysken-50 px-3 py-2.5 text-left hover:bg-sysken-100"
        >
          <MessageSquareText size={17} className="text-sysken-600" />
          <div>
            <p className="text-[13.5px] font-medium text-sysken-700">AI施工判断を開く</p>
            <p className="text-[12px] text-ink-soft">AIチャットによる施工判断</p>
          </div>
        </button>
      </div>

      <Modal
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detail ? detail.title : ''}
        size="md"
        footer={
          <button className="btn-primary" onClick={() => setDetail(null)}>
            閉じる
          </button>
        }
      >
        {detail && (
          <div className="space-y-4">
            <div>
              <p className="mb-1 text-[12.5px] font-semibold text-sysken-700">現在の状態</p>
              <div className="flex items-start gap-2">
                <StatusChip status={detail.status} />
                <span className="text-[13px] text-ink-soft">{detail.detail ?? detail.note}</span>
              </div>
            </div>
            <Field label="機能概要">{aiFeatureDetails[detail.key]?.future ?? detail.note}</Field>
            <Field label="利用データ">{aiFeatureDetails[detail.key]?.data ?? '—'}</Field>
            <Field label="効果">{aiFeatureDetails[detail.key]?.effect ?? '—'}</Field>
          </div>
        )}
      </Modal>
      </div>
    </aside>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-[12.5px] font-semibold text-sysken-700">{label}</p>
      <p className="text-[13.5px] leading-relaxed text-ink">{children}</p>
    </div>
  )
}
