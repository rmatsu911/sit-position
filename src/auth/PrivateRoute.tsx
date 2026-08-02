import { Navigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { useAuth } from './AuthContext'

export function PrivateRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated, ready } = useAuth()
  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas">
        <Loader2 size={28} className="animate-spin text-sysken-500" />
      </div>
    )
  }
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return <>{children}</>
}
