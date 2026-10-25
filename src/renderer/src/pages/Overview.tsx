import type { JSX } from 'react'
import {
  ArrowDownRight,
  ArrowUpRight,
  Cable,
  ChevronRight,
  Globe,
  RefreshCw,
  Router as RouterIcon,
  ScanLine,
  Signal,
  Sparkles,
  Wifi
} from 'lucide-react'
import { DEVICE_TYPE_LABEL, ispLabel } from '@shared/labels'
import { useApp } from '@/store/app'
import { Badge, Button, Dot, EmptyState, Panel, SectionHeader, StatTile } from '@/components/ui'
import { PageHeader } from '@/components/PageHeader'
import { Radar } from '@/components/Radar'
import { Timeline } from '@/components/Timeline'
import { TYPE_ICON, TYPE_TONE, deviceLabel } from '@/lib/device'
import { cn, formatBytes, formatSpeed, timeAgo } from '@/lib/format'

function MiniFact({
  label,
  value,
  icon
}: {
  label: string
  value: string
  icon?: JSX.Element
}): JSX.Element {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-[0.08em] text-faint">
        {icon}
        {label}
      </div>
      <div className="mono mt-1.5 truncate text-[13px] text-ink">{value}</div>
    </div>
  )
}

export function Overview(): JSX.Element {
  const snapshot = useApp((state) => state.snapshot)
  const select = useApp((state) => state.select)
  const setPage = useApp((state) => state.setPage)
  const toast = useApp((state) => state.toast)

  if (!snapshot) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex items-center gap-2 text-[12px] text-muted">
          <RefreshCw className="h-3.5 w-3.5 animate-spin" /> 正在读取本机网络信息…
        </div>
      </div>
    )
  }

  if (!snapshot.network && snapshot.scanning) {
    const progress = snapshot.progress
    const percent = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0
    return (
      <>
        <PageHeader title="总览" subtitle="首次探测局域网" />
        <div className="flex justify-center px-7 py-20">
          <Panel className="relative w-full max-w-[420px] overflow-hidden p-8 text-center">
            <div className="pointer-events-none absolute inset-0 grid-overlay opacity-60" />
            <div className="relative mx-auto mb-5 h-14 w-14">
              <span className="absolute inset-0 animate-ping rounded-full bg-accent/10" />
              <span className="relative flex h-14 w-14 items-center justify-center rounded-full border border-accent/25 bg-accent/10 text-accent">
                <ScanLine className="h-5 w-5" />
              </span>
            </div>
            <h2 className="relative text-[15px] font-semibold text-ink">正在探测你的局域网</h2>
            <p className="relative mt-1.5 text-[11.5px] text-muted">
              {progress.message || '读取网卡信息'}
            </p>
            <div className="relative mt-5 h-1 overflow-hidden rounded-full bg-line/10">
              <div
                className="h-full rounded-full bg-accent transition-all duration-300"
                style={{ width: `${Math.max(percent, 3)}%` }}
              />
            </div>
            <p className="mono relative mt-2 text-[10px] text-faint">{percent}%</p>
          </Panel>
        </div>
      </>
    )
  }

  const { network, devices, events, gateway, traffic } = snapshot
  const iface = network?.active ?? null
  const online = devices.filter((device) => device.online && !device.ignored)
  const router = network?.router ?? null
  const wan = network?.wan ?? null
  const wifi = iface?.wifi ?? null
  const probes = [
    { label: 'mDNS', on: snapshot.settings.enableMdns },
    { label: 'SSDP', on: snapshot.settings.enableSsdp },
    { label: 'NetBIOS', on: snapshot.settings.enableNetbios },
    { label: '端口指纹', on: snapshot.settings.enablePortScan }
  ]
  const location = [wan?.country, wan?.region, wan?.city].filter(Boolean).join(' · ')
  const isp = ispLabel(wan?.isp)
  const ipv6Address = network?.ipv6?.address ?? null
  const newCount = events.filter((event) => event.kind === 'new-device' && Date.now() - event.at < 86_400_000).length
  const recentDevices = online.slice(0, 6)
  const scanning = snapshot.scanning
  const routerTraffic = snapshot.routerTraffic
  const routerLive = Boolean(routerTraffic && routerTraffic.connected && routerTraffic.at !== null)
  const proxyIdle =
    gateway.down === 0 && gateway.up === 0 && traffic.totalDown === 0 && traffic.totalUp === 0
  const fromRouter = routerLive && proxyIdle

  const rescan = async (): Promise<void> => {
    try {
      await window.neko.scan()
    } catch {
      toast({ title: '扫描启动失败', tone: 'danger' })
    }
  }

  return (
    <>
      <PageHeader
        title="总览"
        subtitle={iface ? `${iface.name} · ${iface.cidr}${wifi?.ssid ? ` · ${wifi.ssid}` : ''}` : '尚未扫描'}
      >
        <Button size="sm" variant="secondary" onClick={() => void rescan()} loading={scanning}>
          <RefreshCw className="h-3 w-3" /> 重新扫描
        </Button>
      </PageHeader>

      <div className="space-y-4 px-7 pb-8">
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-12 flex flex-col gap-4 xl:col-span-8">
            <Panel className="relative flex flex-1 flex-col overflow-hidden p-5">
            <div className="pointer-events-none absolute inset-0 grid-overlay opacity-70" />
            <div className="pointer-events-none absolute -right-24 -top-28 h-64 w-64 rounded-full bg-accent/10 blur-3xl" />

            <div className="relative flex flex-1 flex-col">
              <div className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-accent/20 bg-accent/10 text-accent">
                    {iface?.isWifi ? <Wifi className="h-5 w-5" /> : <Cable className="h-5 w-5" />}
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="truncate text-[20px] font-semibold tracking-tight text-ink">
                        {iface?.isWifi ? wifi?.ssid || iface.name : iface?.name ?? '未连接网络'}
                      </h2>
                      {wifi?.band ? <Badge tone="accent">{wifi.band}</Badge> : null}
                      {wifi?.signalPct !== null && wifi?.signalPct !== undefined ? (
                        <Badge tone={wifi.signalPct > 60 ? 'mint' : 'warn'}>
                          <Signal className="h-2.5 w-2.5" />
                          {wifi.signalPct}%
                        </Badge>
                      ) : null}
                      {iface?.isDefault ? <Badge>默认路由</Badge> : null}
                    </div>
                    <p className="mt-1 truncate text-[11.5px] text-muted">
                      {network?.hostname}
                      {iface?.description ? ` · ${iface.description}` : ''}
                      {wifi?.radioType ? ` · ${wifi.radioType}` : ''}
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex flex-1 flex-col justify-center gap-5 py-6">
                <div className="grid grid-cols-2 gap-x-5 gap-y-4 lg:grid-cols-4">
                  <MiniFact label="本机地址" value={iface?.ip ?? '—'} icon={<Cable className="h-3 w-3" />} />
                  <MiniFact label="默认网关" value={router?.ip ?? iface?.gateway ?? '—'} icon={<RouterIcon className="h-3 w-3" />} />
                  <MiniFact label="公网地址" value={wan?.ip ?? '获取中'} icon={<Globe className="h-3 w-3" />} />
                  <MiniFact label="运营商" value={isp ?? '—'} icon={<Signal className="h-3 w-3" />} />
                </div>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <span className="text-[10.5px] text-faint">探测方式</span>
                  {probes.map((probe) => (
                    <span
                      key={probe.label}
                      className="inline-flex items-center gap-1.5 text-[10.5px] text-muted"
                    >
                      <span
                        className={`h-1 w-1 rounded-full ${probe.on ? 'bg-mint' : 'bg-faint/50'}`}
                      />
                      {probe.label}
                    </span>
                  ))}
                  {location ? (
                    <>
                      <span className="h-3 w-px bg-line/10" />
                      <span className="text-[10.5px] text-faint">出口位置</span>
                      <span className="text-[10.5px] text-muted">{location}</span>
                    </>
                  ) : null}
                  {wan?.asn ? (
                    <>
                      <span className="h-3 w-px bg-line/10" />
                      <span className="mono text-[10.5px] text-faint">{wan.asn}</span>
                    </>
                  ) : null}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-x-5 gap-y-2.5 border-t border-line/[0.06] pt-4 text-[11px]">
                <div className="flex items-center gap-2">
                  <span className="text-faint">DNS</span>
                  <div className="flex flex-wrap gap-1">
                    {(iface?.dns ?? []).slice(0, 3).map((dns) => (
                      <span key={dns} className="mono rounded border border-line/10 bg-line/[0.04] px-1.5 py-0.5 text-[10.5px] text-muted">
                        {dns}
                      </span>
                    ))}
                    {!iface?.dns?.length ? <span className="text-faint">—</span> : null}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-faint">网关设备</span>
                  <span className="text-ink">{router?.name || router?.model || '未识别'}</span>
                  {router?.upnp ? <Badge tone="mint">UPnP</Badge> : null}
                  {router?.latencyMs !== null && router?.latencyMs !== undefined ? (
                    <span className="mono text-[10.5px] text-faint">{router.latencyMs.toFixed(1)}ms</span>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-faint">链路</span>
                  <span className="mono text-muted">{iface?.speed ?? '—'}</span>
                </div>
                <div className="flex min-w-0 items-center gap-2">
                  <span className="text-faint">IPv6</span>
                  <span
                    className="mono min-w-0 max-w-[260px] truncate text-[10.5px] text-muted"
                    title={network?.ipv6?.addresses.join('\n') ?? ''}
                  >
                    {ipv6Address ?? '未启用'}
                  </span>
                  {network?.ipv6?.gateway ? (
                    <span className="mono truncate text-[10px] text-faint" title="IPv6 网关">
                      GW {network.ipv6.gateway}
                    </span>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-faint">扫描时间</span>
                  <span className="text-muted">{timeAgo(snapshot.lastScanAt ?? 0)}</span>
                </div>
              </div>
            </div>
            </Panel>

            <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
              <StatTile
                label="在线设备"
                value={online.length}
                hint={`已知 ${devices.length} 台 · 离线 ${devices.length - online.length} 台`}
                icon={<Wifi className="h-3.5 w-3.5" />}
              />
              <StatTile
                label="近 24h 新设备"
                value={newCount}
                hint={newCount > 0 ? '请在设备页确认归属' : '没有新的接入记录'}
                icon={<Sparkles className="h-3.5 w-3.5" />}
                tone={newCount > 0 ? 'accent' : 'default'}
              />
              <StatTile
                label={fromRouter ? '全屋下行' : '实时下行'}
                value={formatSpeed(fromRouter ? (routerTraffic?.down ?? 0) : gateway.down)}
                hint={
                  fromRouter
                    ? '来自光猫 · 所有网口 + Wi-Fi'
                    : gateway.connected
                      ? `网关 ${gateway.version ?? ''}`
                      : '需连接 Clash / Mihomo'
                }
                icon={<ArrowDownRight className="h-3.5 w-3.5" />}
                tone="mint"
              />
              <StatTile
                label={fromRouter ? '全屋上行' : '实时上行'}
                value={formatSpeed(fromRouter ? (routerTraffic?.up ?? 0) : gateway.up)}
                hint={
                  fromRouter
                    ? `开机累计 ↓${formatBytes(routerTraffic?.totalDown ?? 0)}`
                    : gateway.connected
                      ? `本次会话 ${formatSpeed(traffic.totalUp + traffic.totalDown)}`
                      : '未连接网关'
                }
                icon={<ArrowUpRight className="h-3.5 w-3.5" />}
                tone="accent"
              />
            </div>
          </div>

          <Panel className="col-span-12 flex flex-col p-5 xl:col-span-4">
            <SectionHeader
              title="设备雷达"
              subtitle={`${online.length} 台设备在线 · ${devices.length} 台已知`}
              action={
                <Badge tone={scanning ? 'accent' : 'mint'}>
                  <Dot tone={scanning ? 'warn' : 'mint'} pulse={scanning} />
                  {scanning ? '扫描中' : '监听中'}
                </Badge>
              }
            />
            <div className="flex flex-1 items-center justify-center py-4">
              <Radar devices={devices} scanning={scanning} />
            </div>
            <div className="flex items-center justify-between border-t border-line/[0.06] pt-3 text-[10.5px] text-faint">
              <span>发现 {online.length} 个信号源</span>
              <button
                type="button"
                onClick={() => setPage('devices')}
                className="flex cursor-pointer items-center gap-0.5 text-muted transition-colors hover:text-ink focus-ring"
              >
                查看全部 <ChevronRight className="h-3 w-3" />
              </button>
            </div>
          </Panel>
        </div>

        <div className="grid grid-cols-12 gap-4">
          <Panel className="col-span-12 p-5 xl:col-span-7">
            <SectionHeader
              title="在线设备"
              subtitle="点击查看识别依据与端口信息"
              action={
                <Button size="sm" variant="ghost" onClick={() => setPage('devices')}>
                  全部设备 <ChevronRight className="h-3 w-3" />
                </Button>
              }
            />
            <div className="mt-4 space-y-1">
              {recentDevices.length ? (
                recentDevices.map((device) => {
                  const Icon = TYPE_ICON[device.type]
                  const tone = TYPE_TONE[device.type]
                  return (
                    <button
                      key={device.id}
                      type="button"
                      onClick={() => select(device.id)}
                      className="flex w-full cursor-pointer items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-line/[0.05] focus-ring"
                    >
                      <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', tone.bg, tone.text)}>
                        <Icon className="h-4 w-4" strokeWidth={1.7} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <span className="truncate text-[12.5px] text-ink">{deviceLabel(device)}</span>
                          {device.isGateway ? <Badge tone="accent">网关</Badge> : null}
                          {device.isSelf ? <Badge>本机</Badge> : null}
                        </span>
                        <span className="mono mt-0.5 block truncate text-[10.5px] text-faint">
                          {device.ip} · {device.mac ? device.mac.toUpperCase() : 'MAC 未知'}
                        </span>
                      </span>
                      <span className="hidden shrink-0 text-right text-[10.5px] text-faint sm:block">
                        <span className="block text-muted">{DEVICE_TYPE_LABEL[device.type]}</span>
                        <span className="mono block">{device.latencyMs !== null ? `${device.latencyMs}ms` : '—'}</span>
                      </span>
                      <Dot tone="mint" />
                    </button>
                  )
                })
              ) : (
                <EmptyState
                  icon={<Wifi className="h-5 w-5" />}
                  title={scanning ? '正在扫描局域网…' : '还没有发现设备'}
                  description={scanning ? '正在逐个探测网段内的主机，请稍候。' : '点击重新扫描，NekoNet 会通过 ARP、mDNS、SSDP 主动发现家里的设备。'}
                  action={
                    scanning ? undefined : (
                      <Button variant="primary" size="sm" onClick={() => void rescan()}>
                        <RefreshCw className="h-3 w-3" /> 开始扫描
                      </Button>
                    )
                  }
                />
              )}
            </div>
          </Panel>

          <Panel className="col-span-12 p-5 xl:col-span-5">
            <SectionHeader title="网络动态" subtitle="最近的接入与上下线记录" />
            <div className="mt-4">
              <Timeline events={events} limit={6} onSelect={select} />
            </div>
          </Panel>
        </div>
      </div>
    </>
  )
}
