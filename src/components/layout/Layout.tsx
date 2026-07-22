import { Outlet } from 'react-router-dom'
import { AppHeader } from './AppHeader'
import { Sidebar } from './Sidebar'
import { AISupportPanel } from './AISupportPanel'
import { StatusBar } from './StatusBar'
import { ToastHost } from '../ui/ToastHost'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { useApp } from '../../context/AppContext'
import { MonitorPlay, Bell } from 'lucide-react'

export function Layout() {
  const { demoEpoch, demoMode } = useApp()
  return (
    <div className="flex h-screen w-screen min-w-[1280px] flex-col overflow-hidden bg-canvas">
      <AppHeader />
      {demoMode && (
        <div className="flex h-8 shrink-0 items-center gap-3 border-b border-sysken-200 bg-sysken-50 px-4 text-[12.5px] text-sysken-700">
          <span className="flex items-center gap-1.5 font-semibold"><MonitorPlay size={15} />発表用デモモード</span>
          <span className="text-ink-soft">サンプル案件：熊本中央局 光設備更改工事</span>
          <span className="ml-auto flex items-center gap-1.5 text-ng"><Bell size={14} />要対応：接続損失測定が4日遅延／写真3枚未提出／品質確認待ち7件</span>
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
