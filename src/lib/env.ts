// アプリ実行環境・バージョンの一元管理。

declare const __APP_VERSION__: string
declare const __APP_COMMIT__: string
declare const __BUILD_TIME__: string

export type AppEnv = 'development' | 'staging' | 'production'

function resolveEnv(): AppEnv {
  const raw = (import.meta.env.VITE_APP_ENV as string | undefined)?.toLowerCase()
  if (raw === 'production' || raw === 'staging' || raw === 'development') return raw
  return import.meta.env.PROD ? 'production' : 'development'
}

export const APP_ENV: AppEnv = resolveEnv()

export const APP_VERSION: string =
  (import.meta.env.VITE_APP_VERSION as string | undefined) ??
  (typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0')

export const ENV_LABEL: Record<AppEnv, string> = {
  development: '開発環境',
  staging: '検証環境',
  production: '本番環境',
}

/** ビルドしたコードのコミットSHA。実環境の世代確認に使う。 */
export const APP_COMMIT: string =
  typeof __APP_COMMIT__ !== 'undefined' ? __APP_COMMIT__ : 'unknown'

/** ビルド日時（ISO8601）。 */
export const BUILD_TIME: string =
  typeof __BUILD_TIME__ !== 'undefined' ? __BUILD_TIME__ : 'unknown'

/** 表示用に短縮したSHA。 */
export const shortSha = (sha: string): string =>
  sha && sha !== 'unknown' ? sha.slice(0, 7) : 'unknown'
