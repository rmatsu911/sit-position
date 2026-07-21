import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Search,
  Bell,
  HelpCircle,
  ChevronDown,
  PanelRightOpen,
  PanelRightClose,
  RefreshCw,
  Menu as MenuIcon,
  User,
  LogOut,
  Settings as SettingsIcon,
} from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { notifications } from '../../data/notifications'

export function AppHeader() {
  const { toggleSidebar, aiPanelOpen, toggleAiPanel, toast } = useApp()
  const navigate = useNavigate()
  const [openNotif, setOpenNotif] = useState(false)
  const [openUser, setOpenUser] = useState(false)
  const unread = notifications.filter((n) => !n.read).length

  return (
    <header className="relative z-30 flex h-14 shrink-0 items-center gap-4 border-b border-line bg-white px-4">
      <button onClick={toggleSidebar} className="rounded p-1.5 text-ink-soft hover:bg-canvas" title="メニュー開閉">
        <MenuIcon size={20} />
      </button>

      {/* ロゴ + システム名 */}
      <div className="flex items-center gap-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded bg-sysken-500 text-sm font-bold text-white">
          S
        </div>
        <div className="leading-tight">
          <p className="text-[13px] font-bold text-sysken-700">株式会社SYSKEN</p>
          <p className="text-[11px] text-ink-soft">AI施工管理システム</p>
        </div>
      </div>

      {/* 全体検索 */}
      <div className="relative ml-2 w-[380px]">
        <Search size={16} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-soft" />
        <input
          placeholder="案件・工事名・担当者・写真を検索"
          className="w-full rounded border border-line bg-canvas py-1.5 pl-8 pr-3 text-[13px] outline-none focus:border-sysken-400 focus:bg-white"
          onKeyDown={(e) => {
            if (e.key === 'Enter') toast('検索を実行しました（デモ）', 'info')
          }}
        />
      </div>

      <div className="ml-auto flex items-center gap-1">
        {/* 最終同期 */}
        <div className="mr-2 hidden items-center gap-1.5 text-xs text-ink-soft xl:flex">
          <RefreshCw size={13} />
          最終同期：2026/07/21 15:30
        </div>

        {/* AIパネル開閉 */}
        <button
          onClick={toggleAiPanel}
          className="flex items-center gap-1.5 rounded border border-line px-2.5 py-1.5 text-xs text-ink hover:bg-canvas"
          title="AIサポートパネル開閉"
        >
          {aiPanelOpen ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}
          AIパネル
        </button>

        {/* ヘルプ */}
        <button
          onClick={() => toast('ヘルプ：デモ環境です。左メニューから各機能をお試しください。', 'info')}
          className="rounded p-2 text-ink-soft hover:bg-canvas"
          title="ヘルプ"
        >
          <HelpCircle size={19} />
        </button>

        {/* 通知 */}
        <div className="relative">
          <button
            onClick={() => {
              setOpenNotif((v) => !v)
              setOpenUser(false)
            }}
            className="relative rounded p-2 text-ink-soft hover:bg-canvas"
            title="通知"
          >
            <Bell size={19} />
            {unread > 0 && (
              <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-ng px-1 text-[10px] font-bold text-white">
                {unread}
              </span>
            )}
          </button>
          {openNotif && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setOpenNotif(false)} />
              <div className="absolute right-0 top-11 z-40 w-96 rounded border border-line bg-white shadow-pop">
                <div className="flex items-center justify-between border-b border-line px-3 py-2">
                  <span className="text-[13px] font-semibold">通知（未読 {unread}）</span>
                  <button
                    className="text-xs text-sysken-600 hover:underline"
                    onClick={() => {
                      setOpenNotif(false)
                      navigate('/notifications')
                    }}
                  >
                    すべて表示
                  </button>
                </div>
                <ul className="thin-scroll max-h-80 divide-y divide-line overflow-y-auto">
                  {notifications.slice(0, 6).map((n) => (
                    <li
                      key={n.id}
                      className="cursor-pointer px-3 py-2 hover:bg-canvas"
                      onClick={() => {
                        setOpenNotif(false)
                        navigate(n.link)
                      }}
                    >
                      <div className="flex items-center gap-2">
                        {!n.read && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-sysken-500" />}
                        <span className="truncate text-[13px] font-medium text-ink">{n.title}</span>
                      </div>
                      <p className="mt-0.5 line-clamp-1 pl-3.5 text-xs text-ink-soft">{n.body}</p>
                      <p className="pl-3.5 text-[11px] text-slate-400">{n.at}</p>
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}
        </div>

        {/* ユーザー */}
        <div className="relative">
          <button
            onClick={() => {
              setOpenUser((v) => !v)
              setOpenNotif(false)
            }}
            className="ml-1 flex items-center gap-2 rounded border border-line py-1 pl-1.5 pr-2 hover:bg-canvas"
          >
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-sysken-500 text-xs font-bold text-white">
              山
            </div>
            <div className="hidden leading-tight lg:block">
              <p className="text-[13px] font-semibold text-ink">山田 太郎</p>
              <p className="text-[11px] text-ink-soft">施工管理部</p>
            </div>
            <ChevronDown size={15} className="text-ink-soft" />
          </button>
          {openUser && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setOpenUser(false)} />
              <div className="absolute right-0 top-11 z-40 w-52 rounded border border-line bg-white py-1 shadow-pop">
                <div className="border-b border-line px-3 py-2">
                  <p className="text-[13px] font-semibold text-ink">山田 太郎</p>
                  <p className="text-xs text-ink-soft">施工管理部 第一課 / 工事長</p>
                </div>
                <button className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] hover:bg-canvas" onClick={() => { setOpenUser(false); toast('プロフィールを表示します（デモ）') }}>
                  <User size={15} /> プロフィール
                </button>
                <button className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] hover:bg-canvas" onClick={() => { setOpenUser(false); navigate('/settings') }}>
                  <SettingsIcon size={15} /> 設定
                </button>
                <div className="my-1 border-t border-line" />
                <button className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] text-ink-soft hover:bg-canvas" onClick={() => { setOpenUser(false); toast('デモ環境のためログアウトはできません') }}>
                  <LogOut size={15} /> ログアウト
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  )
}
