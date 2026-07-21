import { useEffect, useRef, useState } from 'react'
import {
  Send, Sparkles, History, Search, FileSearch, BookOpen, Lightbulb, User, Bot,
} from 'lucide-react'
import { PageHeader } from '../components/layout/Breadcrumb'
import { Panel, PreparingTag, Spinner } from '../components/ui/common'

interface Msg { role: 'user' | 'ai'; text: string; note?: boolean }

const history = [
  'クロージャ設置前の確認事項は？',
  '光ケーブル敷設の余長基準について',
  '切替作業時の安全確認項目',
  '融着接続の損失基準値',
  '高所作業車の設置位置の注意点',
]

const steps = ['過去事例を検索しています', '類似する通信工事を確認しています', '施工条件を整理しています', '推奨施工方法を表示します']

const fixedAnswer =
  'クロージャ設置前に既設ケーブルの余長、作業スペース、融着点数を確認してください。高所作業を伴う場合は、作業車の設置位置と交通誘導員の配置も事前に確認してください。'

export default function Consultation() {
  const [messages, setMessages] = useState<Msg[]>([
    { role: 'ai', text: 'こんにちは。施工に関する相談を入力してください。過去事例や施工基準をもとに参考情報を表示します（デモ）。' },
  ])
  const [input, setInput] = useState('')
  const [running, setRunning] = useState(false)
  const [stepIdx, setStepIdx] = useState(0)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, running, stepIdx])

  function ask(text: string) {
    if (!text.trim() || running) return
    setMessages((m) => [...m, { role: 'user', text }])
    setInput('')
    setRunning(true)
    setStepIdx(0)
    let i = 0
    const timer = window.setInterval(() => {
      i += 1
      setStepIdx(i)
      if (i >= steps.length) {
        window.clearInterval(timer)
        window.setTimeout(() => {
          setRunning(false)
          setMessages((m) => [
            ...m,
            { role: 'ai', text: fixedAnswer },
            { role: 'ai', text: 'これはデモ用の固定回答です。実際のAI判断や施工基準の照合は行っていません。', note: true },
          ])
        }, 400)
      }
    }, 650)
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
        breadcrumb={[{ label: '施工判断支援' }]}
        title="施工判断支援"
        description="過去事例・施工基準をもとにした判断支援（AIチャット風デモ）"
        actions={<PreparingTag label="AI応答は準備中（固定回答）" />}
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
            {running && (
              <div className="flex gap-2.5">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sysken-50 text-sysken-600"><Sparkles size={16} /></div>
                <div className="rounded-lg border border-line bg-canvas px-3.5 py-2.5">
                  <div className="space-y-1.5">
                    {steps.map((s, i) => (
                      <div key={i} className={`flex items-center gap-2 text-[13px] ${i < stepIdx ? 'text-ink' : i === stepIdx ? 'text-ink' : 'text-slate-300'}`}>
                        {i < stepIdx ? <span className="text-ok">✓</span> : i === stepIdx ? <Spinner size={14} /> : <span className="inline-block h-3.5 w-3.5 rounded-full border border-line" />}
                        {s}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
            <div ref={endRef} />
          </div>

          {/* 入力 */}
          <div className="border-t border-line p-3">
            <div className="mb-2 flex flex-wrap gap-1.5">
              {quickButtons.map((b) => (
                <button key={b.label} onClick={() => ask(b.label + 'を実行')} disabled={running} className="flex items-center gap-1 rounded border border-line px-2.5 py-1 text-xs text-ink hover:bg-canvas disabled:opacity-50">
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
              <button className="btn-primary h-10" onClick={() => ask(input)} disabled={running || !input.trim()}><Send size={16} />送信</button>
            </div>
          </div>
        </div>

        {/* 右：参照情報 */}
        <div className="w-64 shrink-0">
          <Panel title="参照情報" className="h-full">
            <div className="space-y-3 text-[13px]">
              <div>
                <p className="mb-1 text-xs font-semibold text-sysken-700">関連する施工基準</p>
                <ul className="space-y-1 text-ink-soft">
                  <li className="rounded border border-line px-2 py-1">光ケーブル余長基準（社内）</li>
                  <li className="rounded border border-line px-2 py-1">クロージャ設置手順書</li>
                  <li className="rounded border border-line px-2 py-1">高所作業安全基準</li>
                </ul>
              </div>
              <div>
                <p className="mb-1 text-xs font-semibold text-sysken-700">類似案件</p>
                <ul className="space-y-1 text-ink-soft">
                  <li className="rounded border border-line px-2 py-1">玉名局 クロージャ更新工事</li>
                  <li className="rounded border border-line px-2 py-1">菊陽町 通信管路敷設工事</li>
                </ul>
              </div>
              <div className="rounded border border-dashed border-sysken-300 bg-sysken-50 p-2.5 text-[11px] text-sysken-700">
                <div className="mb-1 flex items-center gap-1 font-medium"><Sparkles size={13} />AI判断支援<PreparingTag /></div>
                将来は蓄積した施工データと基準を照合し、根拠付きの推奨を提示する予定です。
              </div>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  )
}
