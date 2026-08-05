/**
 * 全ゲートをまとめて実行し、結果を1枚にまとめる。
 *
 * 実行:
 *   scripts/dev-stack.sh start        # PostgreSQL / backend(:8000) / preview(:4173)
 *   PW_CHROME=<chromium> node scripts/verify-all.mjs
 *
 * ブラウザ回帰は backend と preview が起動していないと動かない。
 * 起動していなければ、そのことを結果に「未実行」として残す（成功にはしない）。
 */
import { execFileSync } from 'node:child_process'

const PREVIEW = process.env.E2E_BASE_URL ?? 'http://localhost:4173'
const API = (process.env.E2E_API_BASE_URL ?? 'http://localhost:8000/api').replace(/\/api$/, '')

/** 各ゲート。`browser: true` はスタックの起動が要る。 */
const GATES = [
  { name: 'typecheck', cmd: 'npm', args: ['run', 'typecheck'] },
  { name: 'ESLint', cmd: 'npm', args: ['run', 'lint'] },
  { name: 'build', cmd: 'npm', args: ['run', 'build'] },
  { name: 'timeline', cmd: 'npm', args: ['run', 'test:timeline'] },
  { name: 'cpm', cmd: 'npm', args: ['run', 'test:cpm'] },
  { name: '固定案件参照の監査', cmd: 'node', args: ['scripts/fixed-project-audit.mjs'] },
  // cwd を backend にするので、python のパスもその中からの相対で指定する
  { name: 'pytest', cmd: '.venv/bin/python', args: ['-m', 'pytest', '-q', '-p', 'no:warnings'], cwd: 'backend' },
  { name: 'Phase 4 回帰', cmd: 'node', args: ['scripts/phase4-verify.mjs'], browser: true },
  { name: 'Phase 5 工程フォーム', cmd: 'node', args: ['scripts/phase5-task-form-verify.mjs'], browser: true },
  { name: 'Phase 5 状態表示', cmd: 'node', args: ['scripts/phase5-status-verify.mjs'], browser: true },
  { name: 'Phase 5 全画面監査', cmd: 'node', args: ['scripts/phase5-screen-audit.mjs'], browser: true },
]

async function up(url) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(3000) })
    return r.ok
  } catch {
    return false
  }
}

const stackUp = (await up(`${API}/health`)) && (await up(PREVIEW))
if (!stackUp) {
  console.log('※ backend(:8000) / preview(:4173) が起動していないため、ブラウザ回帰は実行しません。')
  console.log('  scripts/dev-stack.sh start を先に実行してください。\n')
}

const results = []
for (const g of GATES) {
  if (g.browser && !stackUp) {
    results.push({ name: g.name, state: 'skipped', detail: 'スタック未起動' })
    continue
  }
  process.stdout.write(`▶ ${g.name} … `)
  const started = Date.now()
  try {
    const out = execFileSync(g.cmd, g.args, {
      cwd: g.cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
      maxBuffer: 32 * 1024 * 1024,
    })
    const detail = summarize(out)
    results.push({ name: g.name, state: 'passed', detail, ms: Date.now() - started })
    console.log(`OK${detail ? ` (${detail})` : ''}`)
  } catch (e) {
    const out = `${e.stdout ?? ''}${e.stderr ?? ''}`
    const detail = summarize(out) || String(e.message).split('\n')[0]
    results.push({ name: g.name, state: 'failed', detail, ms: Date.now() - started, out })
    console.log(`FAILED (${detail})`)
  }
}

/** 出力から件数の行だけを拾う（全文は落とす） */
function summarize(out) {
  const lines = out.split('\n').map((l) => l.trim()).filter(Boolean)
  const counted = [...lines].reverse().find((l) => /^結果: \d+ passed/.test(l))
  if (counted) return counted.replace('結果: ', '')
  const pytest = [...lines].reverse().find((l) => /\d+ (passed|failed)/.test(l))
  if (pytest) return pytest.slice(0, 60)
  const eslint = lines.find((l) => l.includes('problems'))
  if (eslint) return eslint.replace('✖ ', '')
  const dots = [...lines].reverse().find((l) => /^\.+\s+\[\s*\d+%\]$/.test(l))
  if (dots) return 'すべて成功'
  return ''
}

console.log('\n================ 結果 ================')
const width = Math.max(...results.map((r) => r.name.length))
for (const r of results) {
  const mark = r.state === 'passed' ? 'PASS' : r.state === 'failed' ? 'FAIL' : 'SKIP'
  console.log(`${mark}  ${r.name.padEnd(width)}  ${r.detail}`)
}

const failed = results.filter((r) => r.state === 'failed')
const skipped = results.filter((r) => r.state === 'skipped')
console.log(
  `\n${results.length - failed.length - skipped.length} passed / ${failed.length} failed / ${skipped.length} skipped`,
)
if (skipped.length) {
  console.log('※ skipped は「成功」ではありません。スタックを起動して実行し直してください。')
}
for (const f of failed) {
  console.log(`\n--- ${f.name} の出力（末尾） ---`)
  console.log((f.out ?? '').split('\n').slice(-25).join('\n'))
}
process.exit(failed.length ? 1 : 0)
