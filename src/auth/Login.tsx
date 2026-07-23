import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { LayoutGrid, LogIn, Loader2 } from 'lucide-react'
import { useAuth } from './AuthContext'
import { ApiError } from '../lib/apiClient'
import { IS_DEV_VISIBLE } from '../lib/env'

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  // 本番では入力欄を空にする。開発/検証では動作確認用に既定値を入れる。
  const [email, setEmail] = useState(IS_DEV_VISIBLE ? 'admin@example.co.jp' : '')
  const [password, setPassword] = useState(IS_DEV_VISIBLE ? 'Passw0rd!' : '')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await login(email, password)
      navigate('/dashboard', { replace: true })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'ログインに失敗しました')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-sysken-500">
            <LayoutGrid size={28} className="text-white" />
          </div>
          <h1 className="mt-3 text-lg font-bold text-sysken-700">株式会社SYSKEN</h1>
          <p className="text-[13px] text-ink-soft">AI施工管理システム</p>
        </div>

        <form onSubmit={submit} className="rounded-lg border border-line bg-white p-6 shadow-panel">
          <h2 className="mb-4 text-[15px] font-semibold text-ink">ログイン</h2>
          {error && (
            <div className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-ng">{error}</div>
          )}
          <label className="label">メールアドレス</label>
          <input className="field mb-3" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required />
          <label className="label">パスワード</label>
          <input className="field mb-4" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
          <button className="btn-primary w-full justify-center" disabled={loading} type="submit">
            {loading ? <Loader2 size={16} className="animate-spin" /> : <LogIn size={16} />}
            ログイン
          </button>
        </form>

        {/* 開発用アカウント案内は開発/検証環境のみ表示（本番では出さない） */}
        {IS_DEV_VISIBLE && (
          <div className="mt-3 rounded border border-line bg-white px-4 py-3 text-[12px] text-ink-soft shadow-panel">
            <p className="font-medium text-ink">開発用アカウント（開発環境のみ表示）</p>
            <p>管理者：admin@example.co.jp ／ Passw0rd!</p>
            <p>案件管理者：yamada@example.co.jp ／ Passw0rd!</p>
            <p>協力会社：partner@example.co.jp ／ Passw0rd!</p>
          </div>
        )}
      </div>
    </div>
  )
}
