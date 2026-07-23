import { Outlet } from 'react-router-dom'
import { AppHeader } from './AppHeader'
import { Sidebar } from './Sidebar'
import { AISupportPanel } from './AISupportPanel'
import { StatusBar } from './StatusBar'
import { ToastHost } from '../ui/ToastHost'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { useApp } from '../../context/AppContext'
import { MonitorPlay } from 'lucide-react'
import { IS_DEV_VISIBLE } from '../../lib/env'

export function Layout() {
  const { demoEpoch, demoMode } = useApp()
  return (
    <div className="flex h-screen w-screen min-w-[1280px] flex-col overflow-hidden bg-canvas">
      <AppHeader />
      {/* 発表用デモモードのバナーは開発/検証環境でのみ表示（本番では出さない） */}
      {IS_DEV_VISIBLE && demoMode && (
        <div className="flex h-8 shrink-0 items-center gap-3 border-b border-sysken-200 bg-sysken-50 px-4 text-[12.5px] text-sysken-700">
          <span className="flex items-center gap-1.5 font-semibold"><MonitorPlay size={15} />発表用デモモード（開発表示）</span>
          <span className="text-ink-soft">画面の見せ方を発表向けに調整します</span>
        </div>
      )}
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <main className="thin-scroll min-w-0 flex-1 overflow-y-auto">
          {/* demoEpoch を key にすることでデモリセット時に現在画面を初期化 */}
          <div key={demoEpoch} className="min-h-full p-6">
            <Outlet />
          </div>
        </main>
        <AISupportPanel />
      </div>
      <StatusBar />
      <ToastHost />
      <ConfirmDialog />
    </div>
  )
}
