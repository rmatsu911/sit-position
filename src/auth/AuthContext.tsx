import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api, getToken, setToken, setUnauthorizedHandler } from '../lib/apiClient'

export interface AuthUser {
  id: number
  email: string
  name: string
  role: string
}

interface AuthValue {
  user: AuthUser | null
  ready: boolean
  isAuthenticated: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [ready, setReady] = useState(false)

  const logout = useCallback(() => {
    setToken(null)
    setUser(null)
  }, [])

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setToken(null)
      setUser(null)
    })
  }, [])

  // 起動時：トークンがあれば /auth/me で復元
  useEffect(() => {
    const token = getToken()
    if (!token) {
      setReady(true)
      return
    }
    api<AuthUser>('/auth/me')
      .then(setUser)
      .catch(() => setToken(null))
      .finally(() => setReady(true))
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const res = await api<{ access_token: string }>('/auth/login', {
      method: 'POST',
      body: { email, password },
      auth: false,
    })
    setToken(res.access_token)
    const me = await api<AuthUser>('/auth/me')
    setUser(me)
  }, [])

  const value = useMemo<AuthValue>(
    () => ({ user, ready, isAuthenticated: !!user, login, logout }),
    [user, ready, login, logout],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
