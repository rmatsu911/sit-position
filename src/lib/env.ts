// アプリ実行環境・バージョンの一元管理。
// 開発専用の表示（Seed識別・AIのDEMO状態・デバッグ情報）は production では出さない。

declare const __APP_VERSION__: string

export type AppEnv = 'development' | 'staging' | 'production'

function resolveEnv(): AppEnv {
  const raw = (import.meta.env.VITE_APP_ENV as string | undefined)?.toLowerCase()
  if (raw === 'production' || raw === 'staging' || raw === 'development') return raw
  return import.meta.env.PROD ? 'production' : 'development'
}

export const APP_ENV: AppEnv = resolveEnv()
export const IS_PRODUCTION = APP_ENV === 'production'
// production 以外（開発・検証）では開発向け表示を許可する
export const IS_DEV_VISIBLE = APP_ENV !== 'production'

export const APP_VERSION: string =
  (import.meta.env.VITE_APP_VERSION as string | undefined) ??
  (typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0')

export const ENV_LABEL: Record<AppEnv, string> = {
  development: '開発環境',
  staging: '検証環境',
  production: '本番環境',
}
