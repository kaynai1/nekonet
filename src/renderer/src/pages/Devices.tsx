import { useMemo, useState } from 'react'
import type { JSX } from 'react'
import { LayoutGrid, List, Search, SlidersHorizontal, X } from 'lucide-react'
import type { Device, DeviceType } from '@shared/types'
import { DEVICE_TYPE_LABEL } from '@shared/labels'
import { useApp } from '@/store/app'
import { Badge, Button, Dot, EmptyState, IconButton, Input, Panel, Toggle } from '@/components/ui'
import { PageHeader } from '@/components/PageHeader'
import { TYPE_ICON, TYPE_TONE, deviceLabel } from '@/lib/device'
import { cn, formatBytes, timeAgo } from '@/lib/format'

const FILTER_TYPES: DeviceType[] = [
  'router',
  'phone',
  'tablet',
  'laptop',
  'desktop',
  'tv',
  'speaker',
  'camera',
  'printer',
  'nas',
  'console',
  'iot',
  'unknown'
]

function matches(device: Device, query: string): boolean {
  if (!query) return true
  const needle = query.toLowerCase()
  return [deviceLabel(device), device.ip, device.mac, device.vendor, device.hostname, device.model]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(needle))
}

export function Devices(): JSX.Element {
  const snapshot = useApp((state) => state.snapshot)
  const select = useApp((state) => state.select)
  const showIgnored = useApp((state) => state.showIgnored)
  const setShowIgnored = useApp((state) => state.setShowIgnored)
  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<'all' | DeviceType>('all')
  const [onlineOnly, setOnlineOnly] = useState(false)
  const [view, setView] = useState<'grid' | 'list'>('grid')

  const devices = snapshot?.devices ?? []

  const counts = useMemo(() => {
    const map = new Map<DeviceType, number>()
    for (const device of devices) {
      if (device.ignored && !showIgnored) continue
      map.set(device.type, (map.get(device.type) ?? 0) + 1)
    }
    return map
  }, [devices, showIgnored])

  const filtered = useMemo(() => {
    return devices
      .filter((device) => (showIgnored ? true : !device.ignored))
      .filter((device) => (onlineOnly ? device.online : true))
      .filter((device) => (typeFilter === 'all' ? true : device.type === typeFilter))
      .filter((device) => matches(device, query.trim()))
      .sort((a, b) => {
        if (a.online !== b.online) return a.online ? -1 : 1
        if (a.isGateway !== b.isGateway) return a.isGateway ? -1 : 1
        if (a.isSelf !== b.isSelf) return a.isSelf ? -1 : 1
        return a.ip.localeCompare(b.ip, 'en', { numeric: true })
      })
  }, [devices, onlineOnly, typeFilter, query, showIgnored])

  const onlineCount = devices.filter((device) => device.online && (showIgnored || !device.ignored)).length

  return (
    <>
      <PageHeader
        title="设备"
        subtitle={`${onlineCount} 台在线 · 共 ${devices.filter((device) => showIgnored || !device.ignored).length} 台已知设备`}
      >
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索名称、IP、MAC 或厂商"
            aria-label="搜索设备"
            className="h-8 w-[240px] pl-8 text-[12px]"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="清空搜索"
              className="absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer text-faint hover:text-ink focus-ring"
            >
              <X className="h-3 w-3" />
            </button>
          ) : null}
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-line/10 bg-line/[0.04] p-0.5">
          <IconButton
            label="网格视图"
            onClick={() => setView('grid')}
            className={cn('h-7 w-7', view === 'grid' && 'bg-line/[0.08] text-ink')}
          >
            <LayoutGrid className="h-3.5 w-3.5" />
          </IconButton>
          <IconButton
            label="列表视图"
            onClick={() => setView('list')}
            className={cn('h-7 w-7', view === 'list' && 'bg-line/[0.08] text-ink')}
          >
            <List className="h-3.5 w-3.5" />
          </IconButton>
        </div>
      </PageHeader>

      <div className="space-y-4 px-7 pb-8">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setTypeFilter('all')}
            className={cn(
              'cursor-pointer rounded-full border px-3 py-1 text-[11.5px] transition-colors focus-ring',
              typeFilter === 'all'
                ? 'border-accent/30 bg-accent/10 text-accent'
                : 'border-line/10 bg-line/[0.03] text-muted hover:text-ink'
            )}
          >
            全部 {devices.filter((device) => showIgnored || !device.ignored).length}
          </button>
          {FILTER_TYPES.filter((type) => counts.get(type)).map((type) => {
            const Icon = TYPE_ICON[type]
            return (
              <button
                key={type}
                type="button"
                onClick={() => setTypeFilter(type)}
                className={cn(
                  'flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-[11.5px] transition-colors focus-ring',
                  typeFilter === type
                    ? 'border-accent/30 bg-accent/10 text-accent'
                    : 'border-line/10 bg-line/[0.03] text-muted hover:text-ink'
                )}
              >
                <Icon className="h-3 w-3" />
                {DEVICE_TYPE_LABEL[type]}
                <span className="mono text-[10px] text-faint">{counts.get(type)}</span>
              </button>
            )
          })}

          <div className="ml-auto flex items-center gap-5">
            <label className="flex cursor-pointer items-center gap-2 text-[11.5px] text-muted">
              仅在线
              <Toggle checked={onlineOnly} onChange={setOnlineOnly} label="仅显示在线设备" />
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-[11.5px] text-muted">
              显示已忽略
              <Toggle checked={showIgnored} onChange={setShowIgnored} label="显示已忽略设备" />
            </label>
          </div>
        </div>

        {filtered.length === 0 ? (
          <Panel>
            <EmptyState
              icon={<SlidersHorizontal className="h-5 w-5" />}
              title="没有匹配的设备"
              description={
                devices.length === 0
                  ? '还没有扫描到设备。点击左侧「立即扫描」开始发现家里的网络设备。'
                  : '尝试更换筛选条件或清空搜索关键字。'
              }
              action={
                devices.length === 0 ? (
                  <Button variant="primary" size="sm" onClick={() => void window.neko.scan()}>
                    开始扫描
                  </Button>
                ) : (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setQuery('')
                      setTypeFilter('all')
                      setOnlineOnly(false)
                    }}
                  >
                    重置筛选
                  </Button>
                )
              }
            />
          </Panel>
        ) : view === 'grid' ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {filtered.map((device) => {
              const Icon = TYPE_ICON[device.type]
              const tone = TYPE_TONE[device.type]
              return (
                <button
                  key={device.id}
                  type="button"
                  onClick={() => select(device.id)}
                  className="panel group cursor-pointer p-4 text-left transition-colors hover:border-accent/25 focus-ring"
                >
                  <div className="flex items-start justify-between">
                    <span className={cn('flex h-10 w-10 items-center justify-center rounded-xl', tone.bg, tone.text)}>
                      <Icon className="h-4.5 w-4.5" strokeWidth={1.7} />
                    </span>
                    <div className="flex items-center gap-1.5">
                      {device.isGateway ? <Badge tone="accent">网关</Badge> : null}
                      {device.isSelf ? <Badge>本机</Badge> : null}
                      {device.ignored ? <Badge tone="warn">已忽略</Badge> : null}
                      <Dot tone={device.online ? 'mint' : 'muted'} pulse={device.online} />
                    </div>
                  </div>

                  <div className="mt-3.5 min-w-0">
                    <div className="truncate text-[13px] font-medium text-ink">{deviceLabel(device)}</div>
                    <div className="mono mt-1 truncate text-[11px] text-muted">{device.ip}</div>
                  </div>

                  <div className="mt-3 flex items-center justify-between border-t border-line/[0.06] pt-2.5 text-[10.5px]">
                    <span className="truncate text-faint">{device.vendor || '未知厂商'}</span>
                    <span className="flex shrink-0 items-center gap-2">
                      <span className="text-muted">{DEVICE_TYPE_LABEL[device.type]}</span>
                      <span className="text-faint">·</span>
                      <span className="text-faint">{timeAgo(device.lastSeen)}</span>
                    </span>
                  </div>

                  {device.traffic.down + device.traffic.up > 0 ? (
                    <div className="mono mt-2 flex items-center gap-3 text-[10px] text-faint">
                      <span className="text-mint">↓ {formatBytes(device.traffic.down)}</span>
                      <span className="text-accent">↑ {formatBytes(device.traffic.up)}</span>
                    </div>
                  ) : null}
                </button>
              )
            })}
          </div>
        ) : (
          <Panel className="overflow-hidden">
            <div className="grid grid-cols-[minmax(0,1fr)_130px_110px_130px_110px] gap-3 border-b border-line/[0.07] px-4 py-2.5 text-[10px] uppercase tracking-[0.08em] text-faint">
              <span>设备</span>
              <span>IP 地址</span>
              <span>类型</span>
              <span>厂商</span>
              <span className="text-right">最近在线</span>
            </div>
            <div className="divide-y divide-line/[0.05]">
              {filtered.map((device) => {
                const Icon = TYPE_ICON[device.type]
                const tone = TYPE_TONE[device.type]
                return (
                  <button
                    key={device.id}
                    type="button"
                    onClick={() => select(device.id)}
                    className="grid w-full cursor-pointer grid-cols-[minmax(0,1fr)_130px_110px_130px_110px] items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-line/[0.04] focus-ring"
                  >
                    <span className="flex min-w-0 items-center gap-2.5">
                      <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-lg', tone.bg, tone.text)}>
                        <Icon className="h-3.5 w-3.5" strokeWidth={1.8} />
                      </span>
                      <span className="min-w-0">
                        <span className="flex items-center gap-1.5">
                          <span className="truncate text-[12px] text-ink">{deviceLabel(device)}</span>
                          {device.isGateway ? <Badge tone="accent">网关</Badge> : null}
                        </span>
                        <span className="mono block truncate text-[10px] text-faint">
                          {device.mac ? device.mac.toUpperCase() : 'MAC 未知'}
                        </span>
                      </span>
                    </span>
                    <span className="mono truncate text-[11px] text-muted">{device.ip}</span>
                    <span className="truncate text-[11px] text-muted">{DEVICE_TYPE_LABEL[device.type]}</span>
                    <span className="truncate text-[11px] text-faint">{device.vendor || '—'}</span>
                    <span className="flex items-center justify-end gap-2 text-[10.5px] text-faint">
                      {timeAgo(device.lastSeen)}
                      <Dot tone={device.online ? 'mint' : 'muted'} />
                    </span>
                  </button>
                )
              })}
            </div>
          </Panel>
        )}
      </div>
    </>
  )
}
