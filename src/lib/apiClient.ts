// バックエンドAPIクライアント。認証トークンの付与・401処理・エラー整形を担う。

const BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://localhost:8000/api'

const TOKEN_KEY = 'sysken.token'

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}
export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token)
  else localStorage.removeItem(TOKEN_KEY)
}

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

type Options = {
  method?: string
  body?: unknown
  // multipart 用
  form?: FormData
  auth?: boolean
}

// 401 を検知したときの通知（AuthContext が購読）
let onUnauthorized: (() => void) | null = null
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn
}

export async function api<T>(path: string, opts: Options = {}): Promise<T> {
  const headers: Record<string, string> = {}
  const token = getToken()
  if (opts.auth !== false && token) headers.Authorization = `Bearer ${token}`

  let body: BodyInit | undefined
  if (opts.form) {
    body = opts.form
  } else if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(opts.body)
  }

  let res: Response
  try {
    res = await fetch(`${BASE_URL}${path}`, { method: opts.method ?? 'GET', headers, body })
  } catch {
    throw new ApiError(0, 'サーバーに接続できません。バックエンドが起動しているか確認してください。')
  }

  if (res.status === 401) {
    onUnauthorized?.()
    throw new ApiError(401, '認証の有効期限が切れました。再度ログインしてください。')
  }
  if (res.status === 204) return undefined as T
  const text = await res.text()
  const data = text ? JSON.parse(text) : undefined
  if (!res.ok) {
    const detail = (data && (data.detail || data.message)) || `エラーが発生しました (${res.status})`
    throw new ApiError(res.status, typeof detail === 'string' ? detail : JSON.stringify(detail))
  }
  return data as T
}
