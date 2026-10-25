import { useMemo, useRef, useState } from 'react'
import type { JSX } from 'react'
import type { TrafficSample } from '@shared/types'
import { cn, formatClockShort, formatSpeed } from '@/lib/format'

interface AreaChartProps {
  data: TrafficSample[]
  height?: number
  className?: string
  emptyHint?: string
}

const W = 1000

function downsample(data: TrafficSample[], limit = 220): TrafficSample[] {
  if (data.length <= limit) return data
  const step = data.length / limit
  const result: TrafficSample[] = []
  for (let i = 0; i < limit; i++) {
    const start = Math.floor(i * step)
    const end = Math.min(data.length, Math.floor((i + 1) * step))
    let up = 0
    let down = 0
    for (let j = start; j < end; j++) {
      up += data[j].up
      down += data[j].down
    }
    const count = Math.max(1, end - start)
    result.push({ t: data[start].t, up: up / count, down: down / count })
  }
  return result
}

function linePath(points: Array<[number, number]>): string {
  if (!points.length) return ''
  if (points.length === 1) return `M ${points[0][0]} ${points[0][1]} L ${W} ${points[0][1]}`
  let path = `M ${points[0][0].toFixed(2)} ${points[0][1].toFixed(2)}`
  for (let i = 1; i < points.length; i++) {
    const [x0, y0] = points[i - 1]
    const [x1, y1] = points[i]
    const cx = (x0 + x1) / 2
    path += ` C ${cx.toFixed(2)} ${y0.toFixed(2)}, ${cx.toFixed(2)} ${y1.toFixed(2)}, ${x1.toFixed(2)} ${y1.toFixed(2)}`
  }
  return path
}

export function AreaChart({ data, height = 210, className, emptyHint }: AreaChartProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState<number | null>(null)

  const points = useMemo(() => downsample(data), [data])
  const max = useMemo(
    () => Math.max(1, ...points.map((p) => Math.max(p.up, p.down))) * 1.15,
    [points]
  )

  const coords = useMemo(() => {
    if (!points.length) return { down: [] as Array<[number, number]>, up: [] as Array<[number, number]> }
    const span = Math.max(1, points.length - 1)
    const make = (key: 'up' | 'down'): Array<[number, number]> =>
      points.map((p, index) => [(index / span) * W, height - (p[key] / max) * (height - 16) - 4])
    return { down: make('down'), up: make('up') }
  }, [points, max, height])

  const downPath = linePath(coords.down)
  const upPath = linePath(coords.up)
  const downArea = coords.down.length ? `${downPath} L ${W} ${height} L 0 ${height} Z` : ''
  const upArea = coords.up.length ? `${upPath} L ${W} ${height} L 0 ${height} Z` : ''

  const handleMove = (event: React.MouseEvent<HTMLDivElement>): void => {
    if (!points.length || !containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width))
    setHover(Math.round(ratio * (points.length - 1)))
  }

  const active = hover !== null ? points[hover] : null
  const activeX = hover !== null && points.length > 1 ? (hover / (points.length - 1)) * 100 : 0

  if (!points.length) {
    return (
      <div
        className={cn('flex items-center justify-center rounded-xl border border-dashed border-line/10 text-[12px] text-faint', className)}
        style={{ height }}
      >
        {emptyHint ?? '暂无流量数据'}
      </div>
    )
  }

  return (
    <div className={cn('relative', className)} ref={containerRef} onMouseMove={handleMove} onMouseLeave={() => setHover(null)}>
      <svg
        viewBox={`0 0 ${W} ${height}`}
        preserveAspectRatio="none"
        className="w-full"
        style={{ height }}
        role="img"
        aria-label="上下行流量趋势"
      >
        <defs>
          <linearGradient id="downFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgb(45,212,191)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="rgb(45,212,191)" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="upFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgb(124,108,255)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="rgb(124,108,255)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {[0.25, 0.5, 0.75].map((ratio) => (
          <line
            key={ratio}
            x1="0"
            x2={W}
            y1={height * ratio}
            y2={height * ratio}
            stroke="rgb(255,255,255,0.055)"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
        ))}

        <path d={downArea} fill="url(#downFill)" />
        <path d={upArea} fill="url(#upFill)" />
        <path
          d={downPath}
          fill="none"
          stroke="rgb(45,212,191)"
          strokeWidth="1.6"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
        <path
          d={upPath}
          fill="none"
          stroke="rgb(124,108,255)"
          strokeWidth="1.4"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />

        {active ? (
          <line
            x1={(activeX / 100) * W}
            x2={(activeX / 100) * W}
            y1="0"
            y2={height}
            stroke="rgb(255,255,255,0.18)"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
        ) : null}
      </svg>

      {active ? (
        <div
          className="pointer-events-none absolute top-1 z-10 -translate-x-1/2 rounded-lg border border-line/10 bg-canvas/95 px-2.5 py-2 text-[10.5px] shadow-lg backdrop-blur"
          style={{ left: `${Math.min(92, Math.max(8, activeX))}%` }}
        >
          <div className="mono mb-1 text-faint">{formatClockShort(active.t)}</div>
          <div className="flex items-center gap-1.5 text-mint">
            <span className="h-1.5 w-1.5 rounded-full bg-mint" />↓ {formatSpeed(active.down)}
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 text-accent">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" />↑ {formatSpeed(active.up)}
          </div>
        </div>
      ) : null}

      <div className="mt-2 flex items-center justify-between text-[10px] text-faint">
        <span className="mono">{formatClockShort(points[0].t)}</span>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-mint" />下行
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" />上行
          </span>
        </div>
        <span className="mono">{formatClockShort(points[points.length - 1].t)}</span>
      </div>
    </div>
  )
}
