/**
 * システム情報（管理者向け）。
 *
 * 「いま動いているのはどのコードか」を画面から確認するための表示。
 * フロントエンドはビルド時に埋め込んだコミットSHA、バックエンドは API が返す
 * コミットSHAを見る。両者が一致しない場合は警告を出す（片方だけデプロイした状態）。
 *
 * 秘密情報（接続文字列・パスワード・トークン・鍵）は表示しない。APIも返さない。
 */
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, CheckCircle2, MinusCircle } from 'lucide-react'
import { Panel } from '../ui/common'
import { api, ApiError } from '../../lib/apiClient'
import { APP_COMMIT, APP_VERSION, BASE_PATH, BUILD_TIME, ENV_LABEL, APP_ENV, shortSha } from '../../lib/env'

export interface SystemInfoOut {
  environment: string
  api_version: string
  backend_commit: string
  backend_built_at: string
  server_time: string
  alembic_revision: string
  database: string
  storage: string
  storage_backend: string
  /** APIが認識している公開パス（サブパス配信の確認用） */
  api_root_path: string
  /** AIは1語にまとめず、意味ごとに分けて受け取る */
  ai: {
    registered_models: number | null
    trained_models: number | null
    pending_jobs: number | null
    last_successful_job_at: string | null
    worker: string
  }
}

export function useSystemInfo(enabled: boolean) {
  return useQuery({
    queryKey: ['system-info'],
    queryFn: () => api<SystemInfoOut>('/system/info'),
    enabled,
    retry: false,
  })
}

const STATUS_LABEL: Record<string, string> = {
  ok: '接続確認済み',
  connected: '接続済み',
  configured: '設定済み（疎通は未確認）',
  read_only: '書き込み不可',
  disconnected: '未接続',
  error: '接続失敗',
  unknown: '未確認',
}

/**
 * AI Worker の稼働状態。
 * 待ちが1件も無い状態は「稼働中」とは書かない（起動していなくても同じ見え方に
 * なるため）。滞留しているときだけ「動いていない」と断定する。
 */
const WORKER_LABEL: Record<string, string> = {
  processing: '処理中',
  not_running: '動いていません（ジョブが滞留）',
  idle: '待ちジョブなし（稼働は未確認）',
  unknown: '未確認',
}

function StatusMark({ value }: { value: string }) {
  const good = value === 'ok' || value === 'connected'
  const bad = value === 'error' || value === 'read_only'
  const Icon = good ? CheckCircle2 : bad ? AlertTriangle : MinusCircle
  const tone = good ? 'text-ok' : bad ? 'text-ng' : 'text-ink-soft'
  return (
    <span className={`inline-flex items-center gap-1 ${tone}`}>
      <Icon size={14} />{STATUS_LABEL[value] ?? value}
    </span>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-line py-1.5 last:border-0">
      <span className="shrink-0 text-[12px] text-ink-soft">{label}</span>
      <span className="text-right text-[13px] text-ink">{value}</span>
    </div>
  )
}

export function SystemInfo({ isAdmin }: { isAdmin: boolean }) {
  const { data, isLoading, isError, error } = useSystemInfo(isAdmin)
  const backendSha = data?.backend_commit ?? 'unknown'
  const known = APP_COMMIT !== 'unknown' && backendSha !== 'unknown'
  const mismatch = known && APP_COMMIT !== backendSha

  return (
    <Panel title="システム情報" data-system-info>
      {mismatch && (
        <div className="mb-3 flex items-start gap-2 rounded border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-ng"
             data-sha-mismatch>
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>
            フロントエンドとバックエンドが別のコードで動いています
            （フロント {shortSha(APP_COMMIT)} ／ バックエンド {shortSha(backendSha)}）。
            どちらか一方だけがデプロイされている可能性があります。
          </span>
        </div>
      )}
      <div className="grid gap-x-8 md:grid-cols-2">
        <div>
          <p className="mb-1 text-[12px] font-semibold text-ink">フロントエンド</p>
          <Row label="コミット" value={<span className="font-mono" data-frontend-sha>{shortSha(APP_COMMIT)}</span>} />
          <Row label="ビルド日時" value={BUILD_TIME === 'unknown' ? '未確認' : BUILD_TIME.replace('T', ' ').slice(0, 16)} />
          <Row label="バージョン" value={APP_VERSION} />
          <Row label="環境" value={ENV_LABEL[APP_ENV]} />
        </div>
        <div>
          <p className="mb-1 text-[12px] font-semibold text-ink">バックエンド</p>
          {!isAdmin ? (
            <p className="py-2 text-[13px] text-ink-soft">バックエンドの情報は管理者のみ表示できます。</p>
          ) : isLoading ? (
            <p className="py-2 text-[13px] text-ink-soft">取得しています…</p>
          ) : isError ? (
            <p className="py-2 text-[13px] text-ng">
              {error instanceof ApiError ? error.message : 'システム情報を取得できませんでした'}
            </p>
          ) : data ? (
            <>
              <Row label="コミット" value={<span className="font-mono" data-backend-sha>{shortSha(data.backend_commit)}</span>} />
              <Row label="ビルド日時" value={data.backend_built_at === 'unknown' ? '未確認' : data.backend_built_at.replace('T', ' ').slice(0, 16)} />
              <Row label="APIバージョン" value={data.api_version} />
              <Row label="環境" value={data.environment} />
              <Row label="migration" value={<span className="font-mono" data-alembic-revision>{data.alembic_revision}</span>} />
              <Row label="データベース" value={<StatusMark value={data.database} />} />
              <Row label="ファイル保存" value={<><StatusMark value={data.storage} /> <span className="text-ink-soft">（{data.storage_backend}）</span></>} />
              <Row label="APIの公開パス" value={<span className="font-mono" data-api-root-path>{data.api_root_path}</span>} />
            </>
          ) : null}
        </div>
      </div>

      {isAdmin && data && (
        <div className="mt-4 border-t border-line pt-3" data-ai-runtime>
          <p className="mb-1 text-[12px] font-semibold text-ink">AI推論の稼働状況</p>
          <p className="mb-2 text-[12px] text-ink-soft">
            「モデルが置かれているか」と「Worker が動いているか」は別のことなので、分けて表示します。
          </p>
          <div className="grid gap-x-8 md:grid-cols-2">
            <div>
              <Row label="登録済みモデル" value={count(data.ai.registered_models)} />
              <Row label="うち学習済み" value={count(data.ai.trained_models)} />
            </div>
            <div>
              <Row label="AI Worker" value={<span data-ai-worker>{WORKER_LABEL[data.ai.worker] ?? data.ai.worker}</span>} />
              <Row label="処理待ちジョブ" value={count(data.ai.pending_jobs)} />
              <Row
                label="最後に成功した推論"
                value={data.ai.last_successful_job_at
                  ? data.ai.last_successful_job_at.replace('T', ' ').slice(0, 16)
                  : '成功した推論はまだありません'}
              />
            </div>
          </div>
        </div>
      )}

      <div className="mt-4 border-t border-line pt-3">
        <p className="mb-1 text-[12px] font-semibold text-ink">画面のベースパス</p>
        <Row label="配信パス" value={<span className="font-mono" data-frontend-base-path>{BASE_PATH}</span>} />
        <p className="mt-1 text-[12px] text-ink-soft">
          サブパス配信（例: <span className="font-mono">/sysken/</span>）では、この値と
          「APIの公開パス」が配信構成と一致している必要があります。
          ビルド時の <span className="font-mono">VITE_BASE_PATH</span> と、
          APIの <span className="font-mono">API_ROOT_PATH</span> で指定します。
        </p>
      </div>
    </Panel>
  )
}

/** 件数。取得できなかったときは0を出さず「未確認」と書く。 */
function count(v: number | null): string {
  return v === null ? '未確認' : `${v}件`
}
