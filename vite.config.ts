import { execSync } from 'node:child_process'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import pkg from './package.json'

/** 稼働中のコード世代を画面から確認できるよう、ビルド時のコミットSHAを埋め込む。 */
function commitSha(): string {
  const fromEnv = process.env.GIT_COMMIT ?? process.env.RENDER_GIT_COMMIT ?? process.env.VITE_GIT_COMMIT
  if (fromEnv) return fromEnv
  try {
    return execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim()
  } catch {
    return 'unknown'
  }
}

// https://vite.dev/config/
// サブパス配信（例: https://example.com/sysken/）に対応する。
// VITE_BASE_PATH を指定してビルドすると、JS/CSS の参照とルーティングがそのパス配下になる。
const BASE = process.env.VITE_BASE_PATH ?? '/'

export default defineConfig({
  base: BASE,
  plugins: [react()],
  define: {
    // アプリの実バージョン（package.json）をビルド時に埋め込む
    __APP_VERSION__: JSON.stringify(pkg.version),
    // 実環境でどのコードが動いているかを確認するための情報（秘密情報は含めない）
    __APP_COMMIT__: JSON.stringify(commitSha()),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    __BASE_PATH__: JSON.stringify(BASE),
  },
  server: {
    host: true,
    port: 5173,
  },
})
