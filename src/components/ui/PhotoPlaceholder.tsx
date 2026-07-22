// 通信工事の施工写真風プレースホルダ（外部画像不使用・自己完結SVG）
// 設備/工程ごとにシーンを描き分け、電子小黒板を重ねて現場写真の質感を再現する。

function hash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

const INDOOR_TYPES = new Set(['ONU', '光成端箱', '配線', 'MDF', 'IDF', 'ラック', '通信ラック', '融着', 'スプライス', '接続試験'])

function OutdoorBg({ seed }: { seed: number }) {
  const c1 = 40 + (seed % 30)
  const c2 = 120 + (seed % 60)
  return (
    <g>
      <rect width="400" height="300" fill="url(#sky)" />
      {/* 雲 */}
      <ellipse cx={c1} cy={38} rx="34" ry="12" fill="#ffffff" opacity="0.75" />
      <ellipse cx={c1 + 26} cy={44} rx="24" ry="10" fill="#ffffff" opacity="0.6" />
      <ellipse cx={c2 + 180} cy={30} rx="30" ry="11" fill="#ffffff" opacity="0.55" />
      {/* 遠景の樹木・建物 */}
      <rect x="0" y="150" width="400" height="30" fill="#8fae7d" opacity="0.55" />
      <rect x="240" y="120" width="46" height="60" fill="#c3ccd6" />
      <rect x="288" y="104" width="34" height="76" fill="#aeb8c4" />
      <rect x="246" y="128" width="8" height="10" fill="#9aa6b3" />
      <rect x="268" y="128" width="8" height="10" fill="#9aa6b3" />
      {/* 地面（アスファルト） */}
      <rect x="0" y="176" width="400" height="124" fill="url(#ground)" />
      <line x1="0" y1="176" x2="400" y2="176" stroke="#7d838c" strokeWidth="1.5" />
      {/* 白線 */}
      <path d="M40 300 L160 200" stroke="#e9edf2" strokeWidth="5" opacity="0.5" strokeDasharray="18 14" />
    </g>
  )
}

function IndoorBg() {
  return (
    <g>
      <rect width="400" height="300" fill="url(#wall)" />
      {/* 床 */}
      <polygon points="0,210 400,210 400,300 0,300" fill="url(#floor)" />
      <line x1="0" y1="210" x2="400" y2="210" stroke="#c3c8cf" strokeWidth="1.5" />
      {/* 床タイル */}
      {[60, 130, 200, 270, 340].map((x) => <line key={x} x1={x} y1="210" x2={x - 30} y2="300" stroke="#c8cdd4" strokeWidth="1" opacity="0.7" />)}
      {/* 照明 */}
      <rect x="70" y="8" width="90" height="10" rx="3" fill="#f2f4d0" opacity="0.9" />
      <rect x="250" y="8" width="90" height="10" rx="3" fill="#f2f4d0" opacity="0.9" />
    </g>
  )
}

function Ground({ cx = 200, cy = 250 }: { cx?: number; cy?: number }) {
  return <ellipse cx={cx} cy={cy} rx="70" ry="12" fill="#000" opacity="0.14" />
}

function Scene({ type }: { type: string }) {
  switch (type) {
    case '電柱':
      return (
        <g>
          <Ground cx={196} cy={276} />
          {/* 電柱 */}
          <rect x="188" y="40" width="16" height="238" fill="url(#pole)" />
          <ellipse cx="196" cy="40" rx="8" ry="4" fill="#c8ccd2" />
          {/* 腕金 */}
          <rect x="150" y="66" width="92" height="7" rx="2" fill="#5b636e" />
          <rect x="158" y="86" width="76" height="6" rx="2" fill="#5b636e" />
          {/* 碍子 */}
          {[158, 180, 212, 234].map((x) => <circle key={x} cx={x} cy={66} r="4" fill="#6b7480" />)}
          {/* 架空ケーブル */}
          <path d="M20 78 Q196 108 380 78" fill="none" stroke="#2a2f37" strokeWidth="3.5" />
          <path d="M20 96 Q196 128 380 96" fill="none" stroke="#2a2f37" strokeWidth="3" opacity="0.85" />
          {/* クロージャ（電柱上） */}
          <rect x="182" y="120" width="28" height="40" rx="6" fill="url(#closure)" />
          <ellipse cx="196" cy="120" rx="14" ry="4" fill="#3f8f63" />
        </g>
      )
    case '光ケーブル':
      return (
        <g>
          <Ground cx={200} cy={272} />
          {/* ケーブルドラム風 */}
          <path d="M30 150 C120 90 150 210 230 150 S330 100 380 150" fill="none" stroke="#0b3d6b" strokeWidth="10" strokeLinecap="round" />
          <path d="M30 172 C120 112 150 232 230 172 S330 122 380 172" fill="none" stroke="#0e5aa0" strokeWidth="9" strokeLinecap="round" opacity="0.85" />
          <path d="M30 194 C120 134 150 254 230 194 S330 144 380 194" fill="none" stroke="#1e6fbd" strokeWidth="7" strokeLinecap="round" opacity="0.7" />
          {/* 固定金具 */}
          {[110, 230, 320].map((x) => <rect key={x} x={x} y={150} width="8" height="30" fill="#8a929c" opacity="0.8" />)}
        </g>
      )
    case 'クロージャ':
      return (
        <g>
          <Ground cx={200} cy={268} />
          <path d="M20 150 L150 150" stroke="#2a2f37" strokeWidth="6" />
          <path d="M250 150 L380 150" stroke="#2a2f37" strokeWidth="6" />
          {/* クロージャ本体 */}
          <rect x="150" y="96" width="100" height="112" rx="16" fill="url(#closure)" />
          <ellipse cx="200" cy="96" rx="50" ry="10" fill="#256e4c" />
          <ellipse cx="200" cy="208" rx="50" ry="10" fill="#1f5c40" />
          <rect x="168" y="110" width="64" height="86" rx="4" fill="#ffffff" opacity="0.12" />
          {/* 締結ボルト */}
          {[120, 150, 180, 210].map((y) => <rect key={y} x="146" y={y} width="108" height="3" fill="#1b5038" opacity="0.5" />)}
          <circle cx="200" cy="150" r="8" fill="#f4c542" opacity="0.9" />
        </g>
      )
    case 'ハンドホール':
      return (
        <g>
          <rect x="0" y="176" width="400" height="124" fill="url(#ground)" />
          <ellipse cx="200" cy="212" rx="120" ry="46" fill="#6b7078" />
          <ellipse cx="200" cy="206" rx="120" ry="46" fill="#9aa0a8" />
          <ellipse cx="200" cy="206" rx="92" ry="34" fill="#7b818a" />
          {/* ケーブル引込 */}
          <path d="M120 206 Q160 250 200 240" fill="none" stroke="#0b3d6b" strokeWidth="6" />
          <path d="M280 206 Q240 250 200 240" fill="none" stroke="#0e5aa0" strokeWidth="6" />
          <ellipse cx="200" cy="206" rx="92" ry="34" fill="none" stroke="#5b636e" strokeWidth="2" strokeDasharray="6 5" />
        </g>
      )
    case '高所作業車':
      return (
        <g>
          <Ground cx={150} cy={284} />
          {/* 車体 */}
          <rect x="40" y="196" width="150" height="52" rx="6" fill="url(#truck)" />
          <rect x="46" y="176" width="52" height="26" rx="4" fill="#dfe4ea" />
          <rect x="52" y="180" width="40" height="18" rx="2" fill="#9fb7cc" />
          <circle cx="72" cy="252" r="16" fill="#2a2f37" /><circle cx="72" cy="252" r="6" fill="#6b7480" />
          <circle cx="160" cy="252" r="16" fill="#2a2f37" /><circle cx="160" cy="252" r="6" fill="#6b7480" />
          {/* ブーム＆バケット */}
          <rect x="150" y="120" width="12" height="86" rx="3" fill="#e0a712" transform="rotate(18 156 160)" />
          <rect x="196" y="96" width="46" height="28" rx="4" fill="#e6a700" />
          <rect x="196" y="96" width="46" height="28" rx="4" fill="none" stroke="#a97e08" strokeWidth="2" />
          {/* 電柱 */}
          <rect x="300" y="40" width="12" height="180" fill="url(#pole)" />
          <path d="M120 78 Q300 60 390 88" fill="none" stroke="#2a2f37" strokeWidth="3" />
        </g>
      )
    case 'ONU':
      return (
        <g>
          {/* 壁面設置のONU */}
          <rect x="120" y="96" width="160" height="104" rx="8" fill="url(#device)" />
          <rect x="120" y="96" width="160" height="104" rx="8" fill="none" stroke="#5a2f78" strokeWidth="2" />
          <circle cx="146" cy="120" r="5" fill="#8fe0a0" /><circle cx="166" cy="120" r="5" fill="#8fe0a0" />
          <circle cx="186" cy="120" r="5" fill="#f4c542" /><circle cx="206" cy="120" r="5" fill="#e07b7b" />
          <rect x="140" y="148" width="120" height="8" rx="4" fill="#ffffff" opacity="0.5" />
          <rect x="140" y="166" width="86" height="8" rx="4" fill="#ffffff" opacity="0.4" />
          {/* 光コード */}
          <path d="M200 200 Q220 250 300 250" fill="none" stroke="#f5c542" strokeWidth="3" />
        </g>
      )
    case '光成端箱':
    case '配線':
      return (
        <g>
          <rect x="96" y="60" width="208" height="150" rx="6" fill="url(#device)" />
          <rect x="96" y="60" width="208" height="150" rx="6" fill="none" stroke="#0a5560" strokeWidth="2" />
          {/* パッチパネル段 */}
          {[80, 108, 136, 164].map((y) => (
            <g key={y}>
              <rect x="108" y={y} width="184" height="18" rx="2" fill="#0d6875" opacity="0.5" />
              {[120, 148, 176, 204, 232, 260].map((x) => <circle key={x} cx={x} cy={y + 9} r="4" fill="#e6f6f8" />)}
            </g>
          ))}
          {/* 光コード束 */}
          <path d="M304 90 Q340 130 300 170" fill="none" stroke="#f5c542" strokeWidth="3" />
          <path d="M304 96 Q346 136 300 176" fill="none" stroke="#4ea0d6" strokeWidth="3" />
        </g>
      )
    case '融着':
    case 'スプライス':
      return (
        <g>
          <Ground cx={200} cy={244} />
          {/* 融着接続機 */}
          <rect x="120" y="150" width="160" height="70" rx="8" fill="url(#truck)" />
          <rect x="150" y="120" width="100" height="40" rx="4" fill="#2a2f37" />
          <rect x="158" y="126" width="84" height="28" rx="2" fill="#1f6feb" opacity="0.85" />
          <text x="200" y="145" fontSize="12" fill="#dbe9ff" textAnchor="middle" fontFamily="monospace">0.02dB</text>
          {/* 光ファイバ */}
          <path d="M40 175 L150 175" stroke="#4ea0d6" strokeWidth="2.5" />
          <path d="M250 175 L360 175" stroke="#f5c542" strokeWidth="2.5" />
          <circle cx="200" cy="176" r="5" fill="#e07b7b" />
        </g>
      )
    case '接続試験':
      return (
        <g>
          <Ground cx={200} cy={250} />
          {/* OTDR/光パワーメータ */}
          <rect x="130" y="130" width="140" height="96" rx="8" fill="#2f3540" />
          <rect x="144" y="144" width="112" height="52" rx="3" fill="#0c1b2e" />
          <polyline points="150,186 176,160 202,172 228,150 250,168" fill="none" stroke="#6ee7a8" strokeWidth="2.5" />
          <circle cx="164" cy="212" r="6" fill="#3f8f63" /><circle cx="188" cy="212" r="6" fill="#c9cfd7" /><circle cx="212" cy="212" r="6" fill="#c9cfd7" />
          <path d="M270 178 Q330 178 350 210" fill="none" stroke="#f5c542" strokeWidth="3" />
        </g>
      )
    case '完成状態':
      return (
        <g>
          <Ground cx={200} cy={266} />
          <path d="M20 140 L150 140" stroke="#2a2f37" strokeWidth="6" />
          <path d="M250 140 L380 140" stroke="#2a2f37" strokeWidth="6" />
          <rect x="150" y="92" width="100" height="104" rx="14" fill="url(#closure)" />
          <ellipse cx="200" cy="92" rx="50" ry="9" fill="#256e4c" />
          {/* 完了チェック */}
          <circle cx="316" cy="70" r="22" fill="#2e8b57" />
          <path d="M305 70 l7 8 l14 -16" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      )
    default:
      return (
        <g>
          <Ground cx={200} cy={252} />
          <rect x="128" y="120" width="144" height="104" rx="8" fill="url(#device)" />
          <rect x="146" y="140" width="108" height="10" rx="3" fill="#ffffff" opacity="0.5" />
          <rect x="146" y="162" width="76" height="10" rx="3" fill="#ffffff" opacity="0.4" />
        </g>
      )
  }
}

export function PhotoPlaceholder({
  type,
  no,
  className = '',
  indoor,
  board,
}: {
  type: string
  no?: string
  className?: string
  indoor?: boolean
  board?: { process?: string; date?: string }
}) {
  const seed = hash((no ?? '') + type)
  const isIndoor = indoor ?? INDOOR_TYPES.has(type)
  return (
    <svg viewBox="0 0 400 300" className={className} preserveAspectRatio="xMidYMid slice" role="img" aria-label={`${type}の施工写真（サンプル）`}>
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#a9d0ee" /><stop offset="100%" stopColor="#e4eef6" /></linearGradient>
        <linearGradient id="ground" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#9aa0a8" /><stop offset="100%" stopColor="#6d727a" /></linearGradient>
        <linearGradient id="wall" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#eef1f5" /><stop offset="100%" stopColor="#d9dee5" /></linearGradient>
        <linearGradient id="floor" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#c1c7cf" /><stop offset="100%" stopColor="#a7aeb7" /></linearGradient>
        <linearGradient id="pole" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="#b9bec6" /><stop offset="45%" stopColor="#e6e9ee" /><stop offset="100%" stopColor="#9aa0a8" /></linearGradient>
        <linearGradient id="closure" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="#2f7d57" /><stop offset="45%" stopColor="#41a06f" /><stop offset="100%" stopColor="#256e4c" /></linearGradient>
        <linearGradient id="device" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="#6b53a0" /><stop offset="50%" stopColor="#7f63c0" /><stop offset="100%" stopColor="#5a2f78" /></linearGradient>
        <linearGradient id="truck" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#e6b93a" /><stop offset="100%" stopColor="#c9971a" /></linearGradient>
        <radialGradient id="vig" cx="50%" cy="45%" r="75%"><stop offset="70%" stopColor="#000" stopOpacity="0" /><stop offset="100%" stopColor="#000" stopOpacity="0.16" /></radialGradient>
      </defs>

      {isIndoor ? <IndoorBg /> : <OutdoorBg seed={seed} />}
      <Scene type={type} />
      <rect width="400" height="300" fill="url(#vig)" />

      {/* 電子小黒板（施工写真らしさ） */}
      {board && (
        <g>
          <rect x="10" y="228" width="176" height="62" rx="3" fill="#123a25" opacity="0.92" />
          <rect x="10" y="228" width="176" height="62" rx="3" fill="none" stroke="#ffffff" strokeWidth="1" opacity="0.4" />
          <text x="18" y="245" fontSize="10" fill="#eaf4ee" fontFamily="sans-serif">工種：{type}</text>
          {board.process && <text x="18" y="261" fontSize="10" fill="#eaf4ee" fontFamily="sans-serif">工程：{board.process.slice(0, 12)}</text>}
          {board.date && <text x="18" y="277" fontSize="10" fill="#eaf4ee" fontFamily="sans-serif">{board.date}</text>}
        </g>
      )}

      {/* 撮影日時（右下・カメラ風） */}
      {board?.date && <text x="392" y="292" fontSize="11" fill="#ffd24a" textAnchor="end" fontFamily="monospace">{board.date}</text>}
      {no && <text x="392" y="20" fontSize="11" fill="#ffffff" textAnchor="end" fontFamily="monospace" opacity="0.9">{no}</text>}
    </svg>
  )
}
