import type { JSX } from 'react'
import { useApp } from '@/store/app'
import { Dot } from '@/components/ui'
import { Logo } from '@/components/Logo'
import { PHASE_LABEL } from '@shared/labels'

export function TitleBar(): JSX.Element {
  const snapshot = useApp((state) => state.snapshot)
  const scanning = snapshot?.scanning ?? false
  const online = snapshot?.devices.filter((device) => device.online && !device.ignored).length ?? 0
  const phase = snapshot?.progress.phase ?? 'idle'
  const message = snapshot?.progress.message

  return (
    <header className="drag-region flex h-10 shrink-0 items-center gap-3 border-b border-line/[0.06] bg-canvas/80 pl-4 pr-[152px] backdrop-blur-xl">
      <div className="flex items-center gap-2">
        <Logo className="h-4 w-4" />
        <span className="text-[12px] font-semibold tracking-[0.02em] text-ink">NekoNet</span>
      </div>
      <span className="text-[10.5px] text-faint">家庭网络透视</span>

      <div className="ml-auto flex min-w-0 items-center gap-3">
        {scanning ? (
          <div className="flex min-w-0 items-center gap-2 text-[10.5px] text-muted">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-70" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent" />
            </span>
            <span className="truncate">{message || PHASE_LABEL[phase] || '正在扫描'}</span>
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-full border border-line/10 bg-line/[0.04] px-2.5 py-1">
            <Dot tone={online > 0 ? 'mint' : 'muted'} />
            <span className="mono text-[10.5px] text-muted">{online} 台在线</span>
          </div>
        )}
      </div>
    </header>
  )
}
