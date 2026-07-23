import { useEffect, useRef, useState } from 'react'
import {
  Send, Sparkles, History, Search, FileSearch, BookOpen, Lightbulb, User, Bot,
} from 'lucide-react'
import { PageHeader } from '../components/layout/Breadcrumb'
import { Panel } from '../components/ui/common'
import { Badge } from '../components/ui/Badge'

interface Msg { role: 'user' | 'ai'; text: string; note?: boolean }

// よくある相談例（クリックで入力補助）。実データではなく入力の例示。
const history = [
  'クロージャ設置前の確認事項は？',
  '光ケーブル敷設の余長基準について',
  '切替作業時の安全確認項目',
  '融着接続の損失基準値',
  '高所作業車の設置位置の注意点',
]

// AI施工判断（過去事例・施工基準の照合＝RAG/LLM）は未提供。
// 事実に反する回答を生成せず、未連携であることを明示する。
const NOT_READY_REPLY =
  'AI施工判断（過去事例・施工基準の照合）は現在準備中です。ナレッジ（施工基準・過去案件・トラブル記録）の連携後に有効化されます。現時点では回答を生成できません。'

export default function Consultation() {
  const [messages, setMessages] = useState<Msg[]>([
    { role: 'ai', text: 'AI施工判断は準備中の機能です。ナレッジ連携後に、過去事例・施工基準を根拠とした回答を提示できるようになります。', note: true },
  ])
  const [input, setInput] = useState('')
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  function ask(text: string) {
    if (!text.trim()) return
    // 事実に反するAI回答は生成しない。未提供である旨を返す。
    setMessages((m) => [...m, { role: 'user', text }, { role: 'ai', text: NOT_READY_REPLY, note: true }])
    setInput('')
  }

  const quickButtons = [
    { icon: Lightbulb, label: '推奨施工方法' },
    { icon: FileSearch, label: '過去事例検索' },
    { icon: Search, label: '類似案件検索' },
    { icon: BookOpen, label: '施工基準確認' },
  ]

  return (
    <div>
      <PageHeader
        breadcrumb={[{ label: 'AI施工判断' }]}
        title="AI施工判断"
        description="過去事例・施工基準を根拠に施工判断を提示（ナレッジ連携後に有効化）"
        actions={<Badge tone="warn" dot>準備中</Badge>}
      />
      <div className="flex gap-4" style={{ height: 'calc(100vh - 210px)' }}>
        {/* 左：相談履歴 */}
        <div className="w-60 shrink-0">
          <Panel title="相談履歴" bodyClassName="p-0" className="h-full">
            <ul className="divide-y divide-line">
              {history.map((h, i) => (
                <li key={i}>
                  <button onClick={() => ask(h)} className="flex w-full items-start gap-2 px-3 py-2.5 text-left text-[13px] text-ink hover:bg-canvas">
                    <History size={14} className="mt-0.5 shrink-0 text-ink-soft" /><span className="line-clamp-2">{h}</span>
                  </button>
                </li>
              ))}
            </ul>
          </Panel>
        </div>

        {/* 中央：チャット */}
        <div className="flex min-w-0 flex-1 flex-col rounded border border-line bg-white shadow-panel">
          <div className="thin-scroll flex-1 space-y-4 overflow-y-auto p-5">
            {messages.map((m, i) => (
              <div key={i} className={`flex gap-2.5 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
                <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${m.role === 'user' ? 'bg-sysken-500 text-white' : m.note ? 'bg-slate-100 text-ink-soft' : 'bg-sysken-50 text-sysken-600'}`}>
                  {m.role === 'user' ? <User size={16} /> : <Bot size={16} />}
                </div>
                <div className={`max-w-[70%] rounded-lg px-3.5 py-2.5 text-[13px] ${m.role === 'user' ? 'bg-sysken-500 text-white' : m.note ? 'border border-dashed border-line bg-canvas text-ink-soft' : 'bg-canvas text-ink'}`}>
                  {m.text}
                </div>
              </div>
            ))}
            <div ref={endRef} />
          </div>

          {/* 入力 */}
          <div className="border-t border-line p-3">
            <div className="mb-2 flex flex-wrap gap-1.5">
              {quickButtons.map((b) => (
                <button key={b.label} onClick={() => ask(b.label + 'を実行')} className="flex items-center gap-1 rounded border border-line px-2.5 py-1 text-xs text-ink hover:bg-canvas disabled:opacity-50">
                  <b.icon size={13} className="text-sysken-600" />{b.label}
                </button>
              ))}
            </div>
            <div className="flex items-end gap-2">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(input) } }}
                placeholder="施工に関する質問を入力（例：クロージャ設置前の確認事項は？）"
                className="field h-12 flex-1 resize-none"
              />
              <button className="btn-primary h-10" onClick={() => ask(input)} disabled={!input.trim()}><Send size={16} />送信</button>
            </div>
          </div>
        </div>

        {/* 右：参照情報 */}
        <div className="w-64 shrink-0">
          <Panel title="参照情報" className="h-full">
            <div className="space-y-3 text-[13px]">
              <div className="rounded border border-amber-200 bg-amber-50 p-2.5 text-[11.5px] text-warn">
                ナレッジ（施工基準・過去案件・トラブル記録）は未連携です。連携後、回答の根拠として実際の参照資料を表示します。
              </div>
              <div className="rounded border border-sysken-200 bg-sysken-50 p-2.5 text-[11px] text-sysken-700">
                <div className="mb-1 flex items-center gap-1 font-medium"><Sparkles size={13} />将来の動作</div>
                蓄積した施工データと施工基準をAIが照合し、根拠（参照資料・過去案件・施工基準）付きの施工判断を提示します。
              </div>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  )
}
