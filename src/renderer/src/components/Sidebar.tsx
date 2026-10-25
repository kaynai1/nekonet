import type { JSX } from 'react'
import {
  Activity,
  LayoutDashboard,
  Network,
  RefreshCw,
  Settings2,
  Square
} from 'lucide-react'
import { useApp, type Page } from '@/store/app'
import { Button, ProgressBar } from '@/components/ui'
import { cn, timeAgo } from '@/lib/format'
import { PHASE_LABEL } from '@shared/labels'

const NAV: Array<{ id: Page; label: string; icon: typeof LayoutDashboard }> = [
  { id: 'overview', label: '总览', icon: LayoutDashboard },
  { id: 'devices', label: '设备', icon: Network },
  { id: 'traffic', label: '流量', icon: Activity },
  { id: 'settings', label: '设置', icon: Settings2 }
]

export function Sidebar(): JSX.Element {
  const page = useApp((state) => state.page)
  const setPage = useApp((state) => state.setPage)
  const snapshot = useApp((state) => state.snapshot)
  const toast = useApp((state) => state.toast)

  const scanning = snapshot?.scanning ?? false
  const progress = snapshot?.progress
  const percent =
    progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0

  const startScan = async (): Promise<void> => {
    try {
      await window.neko.scan()
    } catch {
      toast({ title: '扫描启动失败', tone: 'danger' })
    }
  }

  return (
    <aside className="flex w-[212px] shrink-0 flex-col border-r border-line/[0.06] bg-surface/30">
      <nav className="mt-3 space-y-1 px-3" aria-label="主导航">
        {NAV.map((item) => {
          const Icon = item.icon
          const active = page === item.id
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setPage(item.id)}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'group relative flex h-9 w-full cursor-pointer items-center gap-2.5 rounded-[10px] px-3 text-[12.5px] transition-colors duration-150 focus-ring',
                active
                  ? 'bg-accent/10 text-ink'
                  : 'text-muted hover:bg-line/[0.05] hover:text-ink'
              )}
            >
              {active ? (
                <span className="absolute left-0 top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-full bg-accent" />
              ) : null}
              <Icon
                className={cn('h-4 w-4 transition-colors', active ? 'text-accent' : 'text-faint group-hover:text-muted')}
                strokeWidth={1.8}
              />
              {item.label}
            </button>
          )
        })}
      </nav>

      <div className="mt-auto space-y-3 p-3">
        <div className="panel-quiet p-3">
          <div className="flex items-center justify-between text-[10.5px]">
            <span className="text-muted">上次扫描</span>
            <span className="mono text-faint">{snapshot?.lastScanAt ? timeAgo(snapshot.lastScanAt) : '尚未扫描'}</span>
          </div>

          {scanning ? (
            <div className="mt-2.5 space-y-1.5">
              <ProgressBar value={percent} />
              <div className="flex items-center justify-between text-[10px]">
                <span className="truncate text-muted">{PHASE_LABEL[progress?.phase ?? 'idle']}</span>
                <span className="mono text-faint">{percent}%</span>
              </div>
            </div>
          ) : null}

          <Button
            size="sm"
            variant={scanning ? 'secondary' : 'primary'}
            className="mt-2.5 w-full"
            onClick={scanning ? () => void window.neko.cancelScan() : startScan}
          >
            {scanning ? (
              <>
                <Square className="h-3 w-3" /> 停止扫描
              </>
            ) : (
              <>
                <RefreshCw className="h-3 w-3" /> 立即扫描
              </>
            )}
          </Button>
        </div>

        <div className="flex items-center justify-between px-1 text-[10px] text-faint">
          <span>NekoNet v0.1.0</span>
          <span className="mono">本地运行</span>
        </div>
      </div>
    </aside>
  )
}
