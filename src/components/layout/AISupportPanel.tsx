import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Sparkles, MessageSquareText, X, Info } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { aiFeatures, aiPanelNote, aiPanelHeading, aiPanelIntro, type AiFeature } from '../../data/aiPanel'
import { Modal } from '../ui/Modal'

export function AISupportPanel() {
  const { aiPanelOpen, closeAiPanel } = useApp()
  const navigate = useNavigate()
  const [detail, setDetail] = useState<AiFeature | null>(null)

  return (
    <aside
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
        <p className="mb-1 text-[14px] font-semibold text-ink">将来追加予定のAI機能</p>
        <p className="mb-3 text-[12px] leading-relaxed text-ink-soft">
          {aiPanelIntro}
        </p>

        <div className="space-y-2">
          {aiFeatures.map((it) => (
            <div key={it.title} className="rounded border border-line px-3 py-2.5">
              <p className="text-[13.5px] font-medium text-ink">{it.title}</p>
              <button
                onClick={() => setDetail(it)}
                className="mt-1.5 inline-flex items-center gap-1 rounded border border-sysken-200 bg-sysken-50 px-2 py-1 text-[12px] font-medium text-sysken-700 hover:bg-sysken-100"
              >
                <Info size={13} />
                機能説明を見る
              </button>
            </div>
          ))}
        </div>

        {/* 施工判断支援への導線 */}
        <button
          onClick={() => navigate('/consultation')}
          className="mt-4 flex w-full items-center gap-2 rounded border border-sysken-200 bg-sysken-50 px-3 py-2.5 text-left hover:bg-sysken-100"
        >
          <MessageSquareText size={17} className="text-sysken-600" />
          <div>
            <p className="text-[13.5px] font-medium text-sysken-700">施工判断支援を開く</p>
            <p className="text-[12px] text-ink-soft">AIチャット風の相談画面（デモ）</p>
          </div>
        </button>
      </div>

      <div className="border-t border-line bg-canvas px-4 py-3 text-[12px] leading-relaxed text-ink-soft">
        {aiPanelNote}
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
            <Field label="将来実装する機能">{detail.future}</Field>
            <Field label="利用予定のデータ">{detail.data}</Field>
            <Field label="期待される効果">{detail.effect}</Field>
            <div className="rounded border border-line bg-canvas p-3 text-[12.5px] leading-relaxed text-ink-soft">
              本システムはまず「データを収集・整理・見える化」する業務基盤を構築しています。実際の現場で蓄積したデータを活用し、上記のAI機能を段階的に追加する計画です。現在は未実装で、表示はすべてサンプルです。
            </div>
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
