import type { JSX } from 'react'
import type { Device } from '@shared/types'
import { hashString } from '@/lib/format'
import { TYPE_TONE } from '@/lib/device'
import { cn } from '@/lib/format'

interface RadarProps {
  devices: Device[]
  scanning: boolean
}

export function Radar({ devices, scanning }: RadarProps): JSX.Element {
  const online = devices.filter((device) => device.online && !device.ignored).slice(0, 26)
  const self = devices.find((device) => device.isSelf)

  const blips = online.map((device, index) => {
    const hash = hashString(device.mac ?? device.ip)
    const angle = ((hash % 360) * Math.PI) / 180
    const radius = 16 + (hash % 26) + (index % 3) * 3
    const x = 50 + Math.cos(angle) * radius
    const y = 50 + Math.sin(angle) * radius
    return {
      device,
      x,
      y,
      tone: TYPE_TONE[device.type].dot as string,
      delay: `${(hash % 2600) / 1000}s`
    }
  })

  return (
    <div className="relative mx-auto aspect-square w-full max-w-[320px] select-none">
      <div className="absolute inset-0 rounded-full border border-line/[0.06]" />
      <div className="absolute inset-[9%] rounded-full border border-line/[0.05]" />
      <div className="absolute inset-[22%] rounded-full border border-line/[0.05]" />
      <div className="absolute inset-[36%] rounded-full border border-line/[0.05]" />

      <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden>
        <line x1="50" y1="4" x2="50" y2="96" stroke="rgb(var(--line) / 0.06)" strokeWidth="0.25" />
        <line x1="4" y1="50" x2="96" y2="50" stroke="rgb(var(--line) / 0.06)" strokeWidth="0.25" />
        <circle cx="50" cy="50" r="46" fill="none" stroke="rgb(var(--line) / 0.09)" strokeWidth="0.3" strokeDasharray="0.6 2.2" />
      </svg>

      <div className="absolute inset-[4%] overflow-hidden rounded-full">
        <div
          className={cn('absolute inset-0 radar-sweep', scanning ? 'opacity-100' : 'opacity-70')}
          style={{ animation: 'sweep 5.2s linear infinite' }}
        />
        <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_50%_50%,rgb(var(--accent)/0.10),transparent_62%)]" />
      </div>

      {blips.map(({ device, x, y, tone, delay }) => (
        <div
          key={device.id}
          className="group absolute"
          style={{ left: `${x}%`, top: `${y}%`, transform: 'translate(-50%, -50%)' }}
          title={`${device.customName || device.hostname || device.ip} · ${device.ip}`}
        >
          <span
            className={cn(
              'absolute inset-0 -m-1.5 animate-pulse-ring rounded-full opacity-0',
              tone,
              scanning && 'opacity-40'
            )}
            style={{ animationDelay: delay }}
          />
          <span
            className={cn(
              'relative block h-[7px] w-[7px] rounded-full ring-2 ring-canvas/70 transition-transform duration-200 group-hover:scale-150',
              tone
            )}
            style={{ boxShadow: '0 0 10px 1px currentColor' }}
          />
          <span className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 whitespace-nowrap rounded-md border border-line/10 bg-canvas/90 px-1.5 py-0.5 text-[10px] text-ink opacity-0 backdrop-blur transition-opacity group-hover:opacity-100">
            {device.customName || device.hostname || device.ip}
          </span>
        </div>
      ))}

      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <div className="relative flex h-8 w-8 items-center justify-center rounded-full border border-accent/30 bg-accent/10">
          <span className="absolute inset-0 animate-ping rounded-full bg-accent/15" />
          <span className="relative h-2 w-2 rounded-full bg-accent shadow-[0_0_12px_2px_rgba(124,108,255,0.7)]" />
        </div>
      </div>

      <div className="absolute inset-x-0 -bottom-1 flex justify-center">
        <span className="mono rounded-full border border-line/10 bg-canvas/80 px-2 py-0.5 text-[10px] text-muted backdrop-blur">
          {self?.ip ?? '—'}
        </span>
      </div>
    </div>
  )
}
