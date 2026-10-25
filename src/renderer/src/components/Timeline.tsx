import type { JSX } from 'react'
import { Radar, Server, Sparkles, Wifi, WifiOff } from 'lucide-react'
import type { TimelineEvent } from '@shared/types'
import { cn, timeAgo } from '@/lib/format'

const STYLE: Record<
  TimelineEvent['kind'],
  { icon: typeof Wifi; className: string }
> = {
  'new-device': { icon: Sparkles, className: 'text-accent bg-accent/10 border-accent/20' },
  'device-online': { icon: Wifi, className: 'text-mint bg-mint/10 border-mint/20' },
  'device-offline': { icon: WifiOff, className: 'text-faint bg-line/[0.05] border-line/10' },
  scan: { icon: Radar, className: 'text-accent bg-accent/10 border-accent/20' },
  gateway: { icon: Server, className: 'text-mint bg-mint/10 border-mint/20' }
}

export function Timeline({
  events,
  limit = 6,
  onSelect
}: {
  events: TimelineEvent[]
  limit?: number
  onSelect?: (deviceId: string) => void
}): JSX.Element {
  const list = events.slice(0, limit)

  if (!list.length) {
    return <p className="py-6 text-center text-[12px] text-faint">暂无活动记录</p>
  }

  return (
    <ol className="relative space-y-3">
      <span className="absolute left-[13px] top-2 h-[calc(100%-16px)] w-px bg-line/[0.08]" aria-hidden />
      {list.map((event) => {
        const style = STYLE[event.kind]
        const Icon = style.icon
        return (
          <li key={event.id} className="relative flex gap-3">
            <span
              className={cn(
                'z-10 flex h-[27px] w-[27px] shrink-0 items-center justify-center rounded-lg border',
                style.className
              )}
            >
              <Icon className="h-3.5 w-3.5" strokeWidth={1.9} />
            </span>
            <button
              type="button"
              onClick={() => (event.deviceId && onSelect ? onSelect(event.deviceId) : undefined)}
              className={cn(
                'min-w-0 flex-1 rounded-lg pt-0.5 text-left',
                event.deviceId && onSelect ? 'cursor-pointer hover:opacity-80' : 'cursor-default'
              )}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-[12px] text-ink">{event.title}</span>
                <span className="shrink-0 text-[10px] text-faint">{timeAgo(event.at)}</span>
              </div>
              {event.detail ? (
                <p className="mono mt-0.5 truncate text-[10.5px] text-faint">{event.detail}</p>
              ) : null}
            </button>
          </li>
        )
      })}
    </ol>
  )
}
