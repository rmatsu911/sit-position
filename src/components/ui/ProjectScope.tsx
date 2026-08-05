/**
 * 案件切替の境界。
 *
 * URL が別の案件（または未選択）へ変わったあと、前の案件の内容を**1フレームも
 * 描画しない**ための仕組み。
 *
 * 問題: `history.pushState` は同期に走るのに、React の再描画はそのあと。
 * そのため「URLは案件B・画面はまだ案件A」というフレームが1枚入り得る。
 *
 * 対策: 案件を切り替える操作では、URLを変える**前に** `flushSync` で
 * 「切替中」を同期反映して内容を伏せる。切替先が描画されたら解除する。
 * 戻る／進む／直接URLのようにこちらが起点でない遷移でも、`key={projectId}` で
 * 作り直した子が描かれるまでは同じプレースホルダを出す。
 */
import { useEffect, useSyncExternalStore, type ReactNode } from 'react'
import { flushSync } from 'react-dom'
import { Loader2 } from 'lucide-react'

// 切替中かどうかは React の外に持ち、URL変更の直前に同期で立てる
let switching = false
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())
const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => { listeners.delete(l) }
}

/** URLを変える直前に呼ぶ。内容を同期で伏せる。 */
export function beginProjectSwitch(): void {
  if (switching) return
  flushSync(() => {
    switching = true
    emit()
  })
}

/** 切替先が描画されたら解除する。 */
function endProjectSwitch(): void {
  if (!switching) return
  switching = false
  emit()
}

export function useIsSwitchingProject(): boolean {
  return useSyncExternalStore(subscribe, () => switching, () => false)
}

/**
 * 案件に紐づく内容の外側。切替中は中身を描かない。
 * `projectId` が変わるたびに解除するので、切替先が描けるようになった時点で戻る。
 */
export function ProjectScope({
  projectId, children,
}: {
  projectId: number | undefined
  children: ReactNode
}) {
  const isSwitching = useIsSwitchingProject()
  useEffect(() => {
    // 新しい案件（または未選択）で描画できる状態になった
    endProjectSwitch()
  }, [projectId])

  if (isSwitching) {
    return (
      <div className="flex items-center justify-center gap-2 py-24 text-[13px] text-ink-soft"
           data-project-switching>
        <Loader2 size={18} className="animate-spin text-sysken-500" />
        案件を切り替えています…
      </div>
    )
  }
  return <>{children}</>
}
