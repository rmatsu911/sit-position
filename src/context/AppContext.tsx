import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Tone } from '../types'

interface ToastItem {
  id: number
  message: string
  tone: Tone
}

interface ConfirmState {
  title: string
  message: string
  confirmLabel: string
  cancelLabel: string
  danger: boolean
  resolve: (v: boolean) => void
}

interface AppContextValue {
  sidebarCollapsed: boolean
  toggleSidebar: () => void
  aiPanelOpen: boolean
  toggleAiPanel: () => void
  openAiPanel: () => void
  closeAiPanel: () => void
  toasts: ToastItem[]
  toast: (message: string, tone?: Tone) => void
  dismissToast: (id: number) => void
  confirmState: ConfirmState | null
  confirm: (opts: Partial<Omit<ConfirmState, 'resolve'>>) => Promise<boolean>
  resolveConfirm: (v: boolean) => void
}

const AppContext = createContext<AppContextValue | null>(null)

let toastSeq = 0

export function AppProvider({ children }: { children: ReactNode }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [aiPanelOpen, setAiPanelOpen] = useState(false) // 初期は折りたたみ
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null)

  const dismissToast = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id))
  }, [])

  const toast = useCallback(
    (message: string, tone: Tone = 'info') => {
      const id = ++toastSeq
      setToasts((t) => [...t, { id, message, tone }])
      window.setTimeout(() => dismissToast(id), 3200)
    },
    [dismissToast],
  )

  const confirm = useCallback(
    (opts: Partial<Omit<ConfirmState, 'resolve'>>) =>
      new Promise<boolean>((resolve) => {
        setConfirmState({
          title: opts.title ?? '確認',
          message: opts.message ?? 'この操作を実行しますか？',
          confirmLabel: opts.confirmLabel ?? '実行',
          cancelLabel: opts.cancelLabel ?? 'キャンセル',
          danger: opts.danger ?? false,
          resolve,
        })
      }),
    [],
  )

  const resolveConfirm = useCallback(
    (v: boolean) => {
      confirmState?.resolve(v)
      setConfirmState(null)
    },
    [confirmState],
  )

  const value = useMemo<AppContextValue>(
    () => ({
      sidebarCollapsed,
      toggleSidebar: () => setSidebarCollapsed((v) => !v),
      aiPanelOpen,
      toggleAiPanel: () => setAiPanelOpen((v) => !v),
      openAiPanel: () => setAiPanelOpen(true),
      closeAiPanel: () => setAiPanelOpen(false),
      toasts,
      toast,
      dismissToast,
      confirmState,
      confirm,
      resolveConfirm,
    }),
    [sidebarCollapsed, aiPanelOpen, toasts, toast, dismissToast, confirmState, confirm, resolveConfirm],
  )

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useApp(): AppContextValue {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}
