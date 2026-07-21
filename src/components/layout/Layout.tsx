import { Outlet } from 'react-router-dom'
import { AppHeader } from './AppHeader'
import { Sidebar } from './Sidebar'
import { AISupportPanel } from './AISupportPanel'
import { StatusBar } from './StatusBar'
import { ToastHost } from '../ui/ToastHost'
import { ConfirmDialog } from '../ui/ConfirmDialog'

export function Layout() {
  return (
    <div className="flex h-screen w-screen min-w-[1280px] flex-col overflow-hidden bg-canvas">
      <AppHeader />
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <main className="thin-scroll min-w-0 flex-1 overflow-y-auto">
          <div className="min-h-full p-5">
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
