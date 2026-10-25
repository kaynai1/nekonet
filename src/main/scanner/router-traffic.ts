import type { RouterConfig, RouterFlowRow, RouterTrafficStatus } from '@shared/types'
import {
  fetchRouterClients,
  fetchRouterCounters,
  touchRouterSession,
  type RouterClient
} from './router-clients'

const TICK_MS = 5000
const COUNTER_INTERVAL = 30_000
const CLIENT_INTERVAL = 60_000

function emptyStatus(): RouterTrafficStatus {
  return {
    connected: false,
    error: null,
    at: null,
    up: 0,
    down: 0,
    totalUp: 0,
    totalDown: 0,
    rows: []
  }
}

function keyOfConfig(config: RouterConfig | null): string {
  if (!config) return ''
  return `${config.url}|${config.username}|${config.password}|${config.enabled}`
}

interface CounterSample {
  up: number
  down: number
  at: number
}

export class RouterMonitor {
  private status: RouterTrafficStatus = emptyStatus()
  private config: RouterConfig | null = null
  private key = ''
  private timer: NodeJS.Timeout | null = null
  private busy = false
  private lastCountersAt = 0
  private lastClientsAt = 0
  private previous = new Map<string, CounterSample>()
  private clients: RouterClient[] = []
  private failureAt = 0
  private labels: Record<string, string> = {}
  private autoLabels = new Map<string, string>()

  constructor(private readonly onUpdate: (status: RouterTrafficStatus) => void) {}

  configure(
    config: RouterConfig,
    labels: Record<string, string> = {},
    blocked: { reason: string } | null = null
  ): void {
    const key = keyOfConfig(config)
    if (key !== this.key) {
      this.key = key
      this.previous.clear()
      this.clients = []
      this.autoLabels.clear()
      this.lastCountersAt = 0
      this.lastClientsAt = 0
      this.failureAt = 0
    }

    const nextLabels = labels ?? {}
    const labelsChanged = JSON.stringify(nextLabels) !== JSON.stringify(this.labels)
    this.labels = { ...nextLabels }

    const active = config.enabled && !!config.password
    if (!active) {
      this.config = null
      this.stop()
      if (this.status.connected || this.status.rows.length || this.status.at) {
        this.status = emptyStatus()
        this.onUpdate(this.status)
      }
      return
    }

    if (blocked) {
      this.config = null
      this.stop()
      if (this.status.error !== blocked.reason || this.status.connected) {
        this.status = { ...emptyStatus(), error: blocked.reason }
        this.onUpdate(this.status)
      }
      return
    }

    this.config = { ...config }
    if (labelsChanged && this.status.rows.length) this.applyLabels()
    this.start()
  }

  private labelFor(key: string, auto: string): string {
    const custom = this.labels[key]?.trim()
    return custom || auto
  }

  // 重命名后不等下一次采样，立刻更新已有行的显示名
  private applyLabels(): void {
    let changed = false
    const rows = this.status.rows.map((row) => {
      const auto = row.autoLabel ?? this.autoLabels.get(row.key) ?? row.label
      const label = this.labelFor(row.key, auto)
      if (label === row.label) return row
      changed = true
      return { ...row, label }
    })
    if (!changed) return
    this.status = { ...this.status, rows }
    this.onUpdate(this.status)
  }

  dispose(): void {
    this.stop()
  }

  private start(): void {
    if (this.timer) return
    this.timer = setInterval(() => void this.tick(), TICK_MS)
    void this.tick()
  }

  private stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  private async tick(): Promise<void> {
    if (this.busy || !this.config) return
    const now = Date.now()
    if (this.failureAt && now - this.failureAt < 45_000) return
    this.busy = true
    try {
      await touchRouterSession(this.config)
      if (now - this.lastClientsAt >= CLIENT_INTERVAL) {
        const result = await fetchRouterClients(this.config)
        this.lastClientsAt = Date.now()
        if (result.clients.length) this.clients = result.clients
      }
      if (now - this.lastCountersAt >= COUNTER_INTERVAL) {
        await this.sample()
      }
      this.failureAt = 0
    } catch (error) {
      this.failureAt = Date.now()
      this.status = {
        ...this.status,
        connected: false,
        error: (error as Error).message || '光猫流量读取失败'
      }
      this.onUpdate(this.status)
    } finally {
      this.busy = false
    }
  }

  private clientForPort(port: string | null): RouterClient | undefined {
    if (!port) return undefined
    return this.clients.find((client) => client.port === port)
  }

  private async sample(): Promise<void> {
    if (!this.config) return
    const { ports, ssids } = await fetchRouterCounters(this.config)
    const at = Date.now()
    const rows: RouterFlowRow[] = []
    const seen = new Set<string>()

    for (const port of ports) {
      const key = `port:${port.name}`
      seen.add(key)
      const client = this.clientForPort(port.name)
      const rate = this.rateOf(key, port.upBytes, port.downBytes, at)
      const auto = client?.hostname ? `${port.label} · ${client.hostname}` : port.label
      this.autoLabels.set(key, auto)
      rows.push({
        key,
        autoLabel: auto,
        label: this.labelFor(key, auto),
        detail: client?.ip ?? (port.linkUp ? `已连接 · ${port.speed}` : '未连接'),
        kind: 'wired',
        up: rate.up,
        down: rate.down,
        totalUp: port.upBytes,
        totalDown: port.downBytes
      })
    }

    for (const ssid of ssids) {
      const key = `wifi:${ssid.index}`
      seen.add(key)
      const rate = this.rateOf(key, ssid.upBytes, ssid.downBytes, at)
      const auto = ssid.ssid
      this.autoLabels.set(key, auto)
      rows.push({
        key,
        autoLabel: auto,
        label: this.labelFor(key, auto),
        detail: 'Wi-Fi 汇总',
        kind: 'wifi',
        up: rate.up,
        down: rate.down,
        totalUp: ssid.upBytes,
        totalDown: ssid.downBytes
      })
    }

    for (const key of [...this.previous.keys()]) {
      if (!seen.has(key)) this.previous.delete(key)
    }

    const totalUp = rows.reduce((sum, row) => sum + row.totalUp, 0)
    const totalDown = rows.reduce((sum, row) => sum + row.totalDown, 0)
    const up = rows.reduce((sum, row) => sum + row.up, 0)
    const down = rows.reduce((sum, row) => sum + row.down, 0)
    rows.sort((a, b) => b.down + b.up - (a.down + a.up) || b.totalDown + b.totalUp - (a.totalDown + a.totalUp))

    this.lastCountersAt = at
    this.status = {
      connected: true,
      error: null,
      at,
      up,
      down,
      totalUp,
      totalDown,
      rows
    }
    this.onUpdate(this.status)
  }

  private rateOf(key: string, up: number, down: number, at: number): { up: number; down: number } {
    const previous = this.previous.get(key)
    this.previous.set(key, { up, down, at })
    if (!previous) return { up: 0, down: 0 }
    const seconds = (at - previous.at) / 1000
    if (seconds <= 0) return { up: 0, down: 0 }
    // 网关重启后累计计数会归零
    const upDelta = up >= previous.up ? up - previous.up : 0
    const downDelta = down >= previous.down ? down - previous.down : 0
    return { up: upDelta / seconds, down: downDelta / seconds }
  }
}
