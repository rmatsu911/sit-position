import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Sparkles, ChevronRight, MessageSquareText, X } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { aiPanelByRoute, defaultAiPanel, type AiFeature } from '../../data/aiPanel'
import { PreparingTag } from '../ui/common'
import { Modal } from '../ui/Modal'
import { todayEnv } from '../../data/projects'

export function AISupportPanel() {
  const { aiPanelOpen, toggleAiPanel } = useApp()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const [detail, setDetail] = useState<AiFeature | null>(null)

  if (!aiPanelOpen) return null

  const key = '/' + pathname.split('/')[1]
  const content = aiPanelByRoute[key] ?? defaultAiPanel

  return (
    <aside className="flex h-full w-72 shrink-0 flex-col border-l border-line bg-white">
      <header className="flex items-center justify-between border-b border-line bg-gradient-to-r from-sysken-50 to-white px-3 py-2.5">
        <div className="flex items-center gap-1.5">
          <Sparkles size={16} className="text-sysken-500" />
          <span className="text-[13px] font-semibold text-sysken-700">AIサポート</span>
          <PreparingTag />
        </div>
        <button onClick={toggleAiPanel} className="rounded p-1 text-ink-soft hover:bg-canvas" title="閉じる">
          <X size={16} />
        </button>
      </header>

      <div className="thin-scroll flex-1 overflow-y-auto p-3">
        <p className="mb-1 text-xs font-semibold text-ink">{content.heading}</p>
        <p className="mb-3 text-[11px] text-ink-soft">
          この画面で将来提供予定のAI支援機能です。項目をクリックすると詳細を表示します。
        </p>

        <div className="space-y-2">
          {content.items.map((it) => (
            <button
              key={it.title}
              onClick={() => setDetail(it)}
              className="flex w-full items-center justify-between rounded border border-line px-3 py-2 text-left hover:border-sysken-300 hover:bg-sysken-50"
            >
              <div>
                <p className="text-[13px] font-medium text-ink">{it.title}</p>
                <p className="mt-0.5 text-[11px] text-ink-soft">クリックで詳細</p>
              </div>
              <div className="flex items-center gap-1">
                <PreparingTag />
                <ChevronRight size={15} className="text-ink-soft" />
              </div>
            </button>
          ))}
        </div>

        {/* 施工判断支援への導線 */}
        <button
          onClick={() => navigate('/consultation')}
          className="mt-4 flex w-full items-center gap-2 rounded border border-sysken-200 bg-sysken-50 px-3 py-2 text-left hover:bg-sysken-100"
        >
          <MessageSquareText size={16} className="text-sysken-600" />
          <div>
            <p className="text-[13px] font-medium text-sysken-700">施工判断支援を開く</p>
            <p className="text-[11px] text-ink-soft">AIチャット風の相談画面（デモ）</p>
          </div>
        </button>

        {/* 環境情報 */}
        <div className="mt-4 rounded border border-line bg-canvas p-3">
          <p className="mb-1.5 text-xs font-semibold text-ink">本日の現場環境</p>
          <dl className="space-y-1 text-[11px] text-ink-soft">
            <div className="flex justify-between"><dt>天気</dt><dd className="text-ink">{todayEnv.weather}</dd></div>
            <div className="flex justify-between"><dt>気温</dt><dd className="text-ink">{todayEnv.temp}</dd></div>
            <div className="flex justify-between"><dt>熱中症指数</dt><dd className="font-medium text-warn">WBGT {todayEnv.wbgt}（{todayEnv.wbgtLevel}）</dd></div>
            <div className="flex justify-between"><dt>風</dt><dd className="text-ink">{todayEnv.wind}</dd></div>
          </dl>
        </div>
      </div>

      <div className="border-t border-line px-3 py-2 text-[11px] text-ink-soft">
        ※ 現在AIは未実装です。表示はすべてサンプルです。
      </div>

      <Modal
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detail ? `${detail.title}（将来実装予定）` : ''}
        size="md"
        footer={
          <button className="btn-primary" onClick={() => setDetail(null)}>
            閉じる
          </button>
        }
      >
        {detail && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <PreparingTag label="現在は未実装" />
              <span className="text-xs text-ink-soft">この機能はデモには含まれていません。</span>
            </div>
            <Field label="将来実装する機能">{detail.future}</Field>
            <Field label="使用する予定のデータ">{detail.data}</Field>
            <Field label="期待される効果">{detail.effect}</Field>
            <div className="rounded border border-line bg-canvas p-3 text-xs text-ink-soft">
              本システムはまず「データを収集・整理・見える化」する業務基盤を構築しています。実際の現場で蓄積したデータを活用し、上記のAI機能を段階的に追加する計画です。
            </div>
          </div>
        )}
      </Modal>
    </aside>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-xs font-semibold text-sysken-700">{label}</p>
      <p className="text-[13px] text-ink">{children}</p>
    </div>
  )
}
