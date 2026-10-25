import { useMemo, useState } from 'react'
import type { JSX } from 'react'
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  Cable,
  ExternalLink,
  Gauge,
  Globe2,
  Router,
  Settings2,
  Wifi,
  Zap
} from 'lucide-react'
import type {
  Device,
  RouterFlowRow,
  RouterTrafficHistory,
  RouterTrafficStatus,
  TrafficBucket
} from '@shared/types'
import { ISP_LABEL, ROUTER_BRAND_LABEL } from '@shared/labels'
import { useApp } from '@/store/app'
import { Badge, Button, Dot, EmptyState, Panel, SectionHeader, StatTile } from '@/components/ui'
import { PageHeader } from '@/components/PageHeader'
import { AreaChart } from '@/components/AreaChart'
import { activeDetection } from '@/lib/router'
import { TYPE_ICON, TYPE_TONE, deviceLabel } from '@/lib/device'
import { cn, formatBytes, formatNumber, formatSpeed } from '@/lib/format'

type Range = '30m' | '1h' | '24h'

const RANGES: Array<{ id: Range; label: string }> = [
  { id: '30m', label: '30 分钟' },
  { id: '1h', label: '1 小时' },
  { id: '24h', label: '24 小时' }
]

function RangeTabs({
  value,
  onChange
}: {
  value: Range
  onChange: (value: Range) => void
}): JSX.Element {
  return (
    <div className="flex items-center gap-0.5 rounded-lg border border-line/10 bg-line/[0.04] p-0.5">
      {RANGES.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onChange(item.id)}
          aria-pressed={value === item.id}
          className={cn(
            'cursor-pointer rounded-md px-2.5 py-1 text-[11px] transition-colors focus-ring',
            value === item.id ? 'bg-line/[0.09] text-ink' : 'text-muted hover:text-ink'
          )}
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}

function RankRow({
  bucket,
  max,
  device,
  showCount
}: {
  bucket: TrafficBucket
  max: number
  device?: Device
  showCount: boolean
}): JSX.Element {
  const total = bucket.down + bucket.up
  const width = Math.max(3, Math.round((total / max) * 100))
  const Icon = device ? TYPE_ICON[device.type] : Globe2
  const tone = device ? TYPE_TONE[device.type] : null

  return (
    <div className="flex items-start gap-3 py-2">
      <span
        className={cn(
          'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg',
          tone ? tone.bg : 'bg-line/[0.05]',
          tone ? tone.text : 'text-muted'
        )}
      >
        <Icon className="h-3.5 w-3.5" strokeWidth={1.8} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <span className="truncate text-[12px] text-ink">
            {device ? deviceLabel(device) : bucket.label}
            {showCount && bucket.count > 1 ? (
              <span className="mono ml-1.5 text-[9.5px] text-faint">{bucket.count} 连接</span>
            ) : null}
          </span>
          <span className="mono shrink-0 text-[10.5px] text-muted">{formatBytes(total)}</span>
        </div>
        <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-line/[0.06]">
          <div
            className="h-full rounded-full bg-gradient-to-r from-accent to-mint"
            style={{ width: `${width}%` }}
          />
        </div>
        <div className="mono mt-1 flex items-center gap-3 text-[9.5px] text-faint">
          <span className="text-mint">↓ {formatBytes(bucket.down)}</span>
          <span className="text-accent">↑ {formatBytes(bucket.up)}</span>
          {device ? <span className="truncate">{device.ip}</span> : null}
        </div>
      </div>
    </div>
  )
}

function FlowRow({ row, max }: { row: RouterFlowRow; max: number }): JSX.Element {
  const total = row.down + row.up
  const width = Math.max(3, Math.round((total / max) * 100))
  const Icon = row.kind === 'wifi' ? Wifi : Cable

  return (
    <div className="flex items-start gap-3 py-2">
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-line/[0.05] text-muted">
        <Icon className="h-3.5 w-3.5" strokeWidth={1.8} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <span className="truncate text-[12px] text-ink">{row.label}</span>
          <span className="mono shrink-0 text-[10.5px] text-muted">{formatSpeed(total)}</span>
        </div>
        <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-line/[0.06]">
          <div
            className="h-full rounded-full bg-gradient-to-r from-accent to-mint"
            style={{ width: `${width}%` }}
          />
        </div>
        <div className="mono mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[9.5px] text-faint">
          <span className="text-mint">↓ {formatSpeed(row.down)}</span>
          <span className="text-accent">↑ {formatSpeed(row.up)}</span>
          {row.detail ? <span className="truncate">{row.detail}</span> : null}
          <span className="ml-auto shrink-0">
            累计 ↓{formatBytes(row.totalDown)} ↑{formatBytes(row.totalUp)}
          </span>
        </div>
      </div>
    </div>
  )
}

function RouterFlowPanel({
  traffic,
  history
}: {
  traffic: RouterTrafficStatus
  history: RouterTrafficHistory
}): JSX.Element {
  const [range, setRange] = useState<Range>('30m')
  const max = Math.max(1, ...traffic.rows.map((row) => row.down + row.up))
  const wifiRows = traffic.rows.filter((row) => row.kind === 'wifi').length

  const series = useMemo(() => {
    if (range === '24h') return history.minutes
    if (range === '1h') return history.samples.slice(-120)
    return history.samples.slice(-60)
  }, [range, history])

  const peak = useMemo(() => {
    let down = 0
    let up = 0
    for (const sample of series) {
      if (sample.down > down) down = sample.down
      if (sample.up > up) up = sample.up
    }
    return { up, down }
  }, [series])

  return (
    <Panel className="p-5">
      <SectionHeader
        title="光猫流量"
        subtitle="直接读取光猫网口与 Wi-Fi 的累计计数，按采样差值计算当前速率"
        action={
          <Badge tone={traffic.connected ? 'mint' : 'warn'}>
            <Dot tone={traffic.connected ? 'mint' : 'warn'} pulse={traffic.connected} />
            {traffic.connected ? '光猫已连接' : '读取中断'}
          </Badge>
        }
      />

      <div className="mt-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatTile
          label="当前下行"
          value={formatSpeed(traffic.down)}
          hint={`峰值 ${formatSpeed(peak.down)}`}
          icon={<ArrowDownRight className="h-3.5 w-3.5" />}
          tone="mint"
        />
        <StatTile
          label="当前上行"
          value={formatSpeed(traffic.up)}
          hint={`峰值 ${formatSpeed(peak.up)}`}
          icon={<ArrowUpRight className="h-3.5 w-3.5" />}
          tone="accent"
        />
        <StatTile
          label="开机以来下行"
          value={formatBytes(traffic.totalDown)}
          hint={traffic.at ? '光猫重启后归零' : '等待首次采样'}
          icon={<Cable className="h-3.5 w-3.5" />}
        />
        <StatTile
          label="开机以来上行"
          value={formatBytes(traffic.totalUp)}
          hint={`${traffic.rows.length - wifiRows} 个网口 · ${wifiRows} 个 Wi-Fi`}
          icon={<Router className="h-3.5 w-3.5" />}
        />
      </div>

      {traffic.error ? (
        <div className="mt-3 rounded-lg border border-warn/25 bg-warn/[0.06] px-3 py-2 text-[11px] leading-relaxed text-warn">
          {traffic.error}
        </div>
      ) : null}

      <div className="mt-4">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[11px] text-muted">全屋速率曲线</span>
          <RangeTabs value={range} onChange={setRange} />
        </div>
        <div className="mt-2">
          <AreaChart data={series} height={180} emptyHint="采样中，每 30 秒记录一个点…" />
        </div>
      </div>

      <div className="mt-3 divide-y divide-line/[0.05]">
        {traffic.rows.length ? (
          traffic.rows.map((row) => <FlowRow key={row.key} row={row} max={max} />)
        ) : (
          <p className="py-8 text-center text-[11.5px] text-faint">等待光猫返回网口与 Wi-Fi 计数…</p>
        )}
      </div>

      <p className="mt-3 text-[10.5px] leading-relaxed text-faint">
        光猫只提供网口和 SSID 级累计流量：无线设备只能看到 Wi-Fi 汇总，经下级路由器 NAT
        的设备会合并成一条。光猫重启后累计值归零，曲线会保留历史。
      </p>
    </Panel>
  )
}

export function Traffic(): JSX.Element {
  const snapshot = useApp((state) => state.snapshot)
  const setPage = useApp((state) => state.setPage)
  const toast = useApp((state) => state.toast)
  const [range, setRange] = useState<Range>('30m')

  const traffic = snapshot?.traffic
  const gateway = snapshot?.gateway
  const routerTraffic = snapshot?.routerTraffic
  const gatewayEnabled = snapshot?.settings.gateway.enabled ?? false
  const devices = useMemo(() => snapshot?.devices ?? [], [snapshot?.devices])

  const series = useMemo(() => {
    if (!traffic) return []
    if (range === '24h') return traffic.minutes
    if (range === '1h') return traffic.samples
    return traffic.samples.slice(-1800)
  }, [range, traffic])

  const deviceByIp = useMemo(() => {
    const map = new Map<string, Device>()
    for (const device of devices) map.set(device.ip, device)
    return map
  }, [devices])

  const peak = useMemo(() => {
    let down = 0
    let up = 0
    for (const sample of series) {
      if (sample.down > down) down = sample.down
      if (sample.up > up) up = sample.up
    }
    return { up, down }
  }, [series])

  const maxDevice = Math.max(1, ...(traffic?.devices.map((item) => item.down + item.up) ?? [1]))
  const maxDomain = Math.max(1, ...(traffic?.domains.map((item) => item.down + item.up) ?? [1]))

  if (!snapshot || !traffic || !gateway) {
    return (
      <div className="flex h-full items-center justify-center text-[12px] text-muted">
        <Cable className="mr-2 h-3.5 w-3.5 animate-pulse" /> 正在读取流量数据…
      </div>
    )
  }

  const routerActive = Boolean(
    routerTraffic && (routerTraffic.connected || routerTraffic.rows.length > 0)
  )
  const proxyIdle =
    gateway.down === 0 &&
    gateway.up === 0 &&
    traffic.totalDown === 0 &&
    traffic.totalUp === 0 &&
    traffic.devices.length === 0

  if (!gateway.connected) {
    if (routerTraffic && (routerTraffic.connected || routerTraffic.rows.length > 0)) {
      return (
        <>
          <PageHeader title="流量" subtitle="光猫网口与 Wi-Fi 的实时流量，不经过本机代理">
            <Badge tone="mint">
              <Dot tone="mint" pulse />
              来自光猫
            </Badge>
          </PageHeader>
          <div className="space-y-4 px-7 pb-8">
            <RouterFlowPanel traffic={routerTraffic} history={snapshot.routerHistory} />
            <Panel className="p-4">
              <p className="text-[11px] leading-relaxed text-muted">
                这些数字直接来自光猫，不需要开启系统代理，也不经过任何代理节点。光猫只公开网口与
                SSID 的累计流量，因此看不到单台无线设备和域名；需要按设备、按域名统计时，再开启内置内核。
              </p>
            </Panel>
          </div>
        </>
      )
    }

    const detection = activeDetection(snapshot.routerDetection, snapshot.settings.router.url)
    if (detection && detection.reachable && !detection.supported) {
      return (
        <>
          <PageHeader title="流量" subtitle="光猫网口与 Wi-Fi 的实时流量，不经过本机代理">
            <Badge tone="warn">
              <Dot tone="warn" />
              暂不支持
            </Badge>
          </PageHeader>
          <div className="space-y-4 px-7 pb-8">
            <Panel className="p-5">
              <SectionHeader
                title="这台光猫暂不支持读取流量"
                subtitle="流量读取按固件页面逐家适配，目前只适配中兴 H3-2s"
              />
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Badge tone="neutral">{ROUTER_BRAND_LABEL[detection.brand] ?? detection.brand}</Badge>
                {detection.isp ? <Badge tone="accent">{ISP_LABEL[detection.isp]}</Badge> : null}
                {detection.title ? (
                  <span className="text-[10.5px] text-faint">页面标题：{detection.title}</span>
                ) : null}
              </div>
              <p className="mt-3 text-[11.5px] leading-relaxed text-muted">{detection.note}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => void window.neko.openExternal(detection.url)}
                >
                  <ExternalLink className="h-3 w-3" /> 打开光猫后台
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setPage('settings')}>
                  <Settings2 className="h-3 w-3" /> 前往设置
                </Button>
              </div>
            </Panel>
            <Panel className="p-4">
              <p className="text-[11px] leading-relaxed text-muted">
                设备扫描、网关信息与 IPv6 识别不受影响。想按设备 / 域名统计流量，仍然可以开启内置内核。
              </p>
            </Panel>
          </div>
        </>
      )
    }

    const coreEnabled = snapshot.settings.core.enabled
    const coreRunning = snapshot.core.running
    const coreError = snapshot.core.error
    const starting = coreEnabled && !coreRunning && !coreError
    const startCore = async (): Promise<void> => {
      try {
        await window.neko.updateSettings({ core: { enabled: true } })
        toast({ title: '正在启动内置流量内核', tone: 'default' })
      } catch {
        toast({ title: '启动失败', tone: 'danger' })
      }
    }

    return (
      <>
        <PageHeader title="流量" subtitle="按设备与域名统计的实时流量" />
        <div className="space-y-4 px-7 pb-8">
          <Panel>
            <EmptyState
              icon={<Activity className="h-5 w-5" />}
              title={
                starting
                  ? '正在启动内置内核…'
                  : coreError
                    ? '内核启动失败'
                    : gatewayEnabled
                      ? '正在连接控制器…'
                      : '还没有流量数据'
              }
              description={
                coreError
                  ? `内核启动失败：${coreError}`
                  : '安装包已自带 Mihomo 内核，无需另外下载。开启后即可在这里看到经过本机的实时速率、设备排行与域名排行。'
              }
              action={
                <div className="flex items-center gap-2">
                  <Button
                    variant="primary"
                    size="sm"
                    loading={starting}
                    onClick={() => void startCore()}
                  >
                    <Zap className="h-3 w-3" /> 一键启动内置内核
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => setPage('settings')}>
                    <Settings2 className="h-3 w-3" /> 前往设置
                  </Button>
                </div>
              }
            />
          </Panel>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {[
              { title: '启动内核', body: '内置 Mihomo 已随安装包提供，点一下即启动，无需下载和配置文件' },
              { title: '决定统计范围', body: '开启「设为系统代理」统计本机应用；代理端口默认只对本机开放' },
              { title: '实时查看', body: '此处将出现逐秒速率曲线、设备排行与域名排行，并自动持久化历史' }
            ].map((step, index) => (
              <Panel key={step.title} className="p-4">
                <div className="mono text-[10px] text-accent">STEP {index + 1}</div>
                <div className="mt-1.5 text-[12.5px] font-medium text-ink">{step.title}</div>
                <p className="mt-1 text-[11px] leading-relaxed text-muted">{step.body}</p>
              </Panel>
            ))}
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <PageHeader
        title="流量"
        subtitle={
          routerActive && proxyIdle
            ? '光猫网口与 Wi-Fi 的实时流量，不经过本机代理'
            : `${formatNumber(snapshot.devices.length)} 台设备 · ${traffic.domains.length} 个活跃域名`
        }
      >
        <Badge tone="mint">
          <Dot tone="mint" pulse />
          {routerActive && proxyIdle ? '来自光猫' : `已连接 ${gateway.version ?? ''}`}
        </Badge>
      </PageHeader>

      <div className="space-y-4 px-7 pb-8">
        {routerActive && routerTraffic ? (
          <RouterFlowPanel traffic={routerTraffic} history={snapshot.routerHistory} />
        ) : null}

        {proxyIdle ? (
          <Panel className="flex items-start gap-3 p-4">
            <Activity className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
            <div className="min-w-0 flex-1">
              <div className="text-[12.5px] font-medium text-ink">
                {routerActive ? '内置内核没有记录到流量' : '还没有流量数据'}
              </div>
              <p className="mt-1 break-words text-[11px] leading-relaxed text-muted">
                {routerActive
                  ? '上方数字直接来自光猫，不需要系统代理。内置内核只统计经过代理的连接，未开启时不会产生数据。'
                  : '开启光猫读取可以看到全屋速率；按设备、按域名统计则需要启用内置内核并设为系统代理。'}
              </p>
            </div>
            <Button
              size="sm"
              variant="secondary"
              className="shrink-0"
              onClick={() => setPage('settings')}
            >
              <Settings2 className="h-3 w-3" /> 设置
            </Button>
          </Panel>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
              <StatTile
                label="实时下行"
                value={formatSpeed(gateway.down)}
                hint={`峰值 ${formatSpeed(peak.down)}`}
                icon={<ArrowDownRight className="h-3.5 w-3.5" />}
                tone="mint"
              />
              <StatTile
                label="实时上行"
                value={formatSpeed(gateway.up)}
                hint={`峰值 ${formatSpeed(peak.up)}`}
                icon={<ArrowUpRight className="h-3.5 w-3.5" />}
                tone="accent"
              />
              <StatTile
                label="会话下行"
                value={formatBytes(traffic.totalDown)}
                hint={`${formatNumber(traffic.devices.length)} 台设备产生流量`}
                icon={<Cable className="h-3.5 w-3.5" />}
              />
              <StatTile
                label="会话上行"
                value={formatBytes(traffic.totalUp)}
                hint={gateway.node ? `当前节点 ${gateway.node}` : '未识别代理节点'}
                icon={<Gauge className="h-3.5 w-3.5" />}
              />
            </div>

            <Panel className="p-5">
              <SectionHeader
                title="速率曲线"
                subtitle="采样自网关 /traffic 实时推送"
                action={<RangeTabs value={range} onChange={setRange} />}
              />
              <div className="mt-4">
                <AreaChart data={series} height={250} emptyHint="等待流量采样…" />
              </div>
            </Panel>

            <div className="grid grid-cols-12 gap-4">
              <Panel className="col-span-12 p-5 xl:col-span-7">
                <SectionHeader
                  title="设备流量排行"
                  subtitle="按来源 IP 聚合本次会话的累计流量"
                  action={<Badge tone="neutral">{traffic.devices.length}</Badge>}
                />
                <div className="mt-3 divide-y divide-line/[0.05]">
                  {traffic.devices.length ? (
                    traffic.devices.slice(0, 10).map((bucket) => (
                      <RankRow
                        key={bucket.key}
                        bucket={bucket}
                        max={maxDevice}
                        device={deviceByIp.get(bucket.key)}
                        showCount={false}
                      />
                    ))
                  ) : (
                    <p className="py-8 text-center text-[11.5px] text-faint">
                      内置内核只统计经过代理的连接，这里目前没有数据。
                    </p>
                  )}
                </div>
              </Panel>

              <Panel className="col-span-12 p-5 xl:col-span-5">
                <SectionHeader
                  title="域名排行"
                  subtitle="按连接目标聚合，包含直连与代理流量"
                  action={<Badge tone="neutral">{traffic.domains.length}</Badge>}
                />
                <div className="mt-3 divide-y divide-line/[0.05]">
                  {traffic.domains.length ? (
                    traffic.domains.slice(0, 10).map((bucket) => (
                      <RankRow key={bucket.key} bucket={bucket} max={maxDomain} showCount />
                    ))
                  ) : (
                    <p className="py-8 text-center text-[11.5px] text-faint">暂无域名连接记录。</p>
                  )}
                </div>
              </Panel>
            </div>
          </>
        )}
      </div>
    </>
  )
}
