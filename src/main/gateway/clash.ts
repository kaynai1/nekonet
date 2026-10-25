import WebSocket from 'ws'
import http from 'node:http'
import https from 'node:https'
import type {
  GatewayConfig,
  GatewayStatus,
  TrafficBucket,
  TrafficPayload,
  TrafficSample
} from '@shared/types'

interface ClashConnection {
  id: string
  upload: number
  download: number
  metadata?: {
    sourceIP?: string
    host?: string
    destinationIP?: string
    network?: string
    processPath?: string
  }
  chains?: string[]
  rule?: string
}

interface ClashConnectionsResponse {
  downloadTotal?: number
  uploadTotal?: number
  connections?: ClashConnection[]
}

interface ClashVersion {
  version?: string
  meta?: boolean
}

const SAMPLE_KEEP = 3600
const MINUTE_KEEP = 1440
const DEVICE_KEEP = 512

function normalizeUrl(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return ''
  if (/^https?:\/\//i.test(trimmed)) return trimmed.replace(/\/+$/, '')
  return `http://${trimmed}`.replace(/\/+$/, '')
}

function httpJson<T>(
  url: string,
  secret: string,
  timeoutMs = 4000
): Promise<{ ok: boolean; data: T | null; error: string | null }> {
  return new Promise((resolve) => {
    let target: URL
    try {
      target = new URL(url)
    } catch {
      resolve({ ok: false, data: null, error: '地址格式不正确' })
      return
    }
    const client = target.protocol === 'https:' ? https : http
    const headers: Record<string, string> = { Accept: 'application/json' }
    if (secret) headers.Authorization = `Bearer ${secret}`
    const req = client.request(
      target,
      { method: 'GET', timeout: timeoutMs, headers, rejectUnauthorized: false },
      (res) => {
        let body = ''
        res.setEncoding('utf8')
        res.on('data', (chunk: string) => {
          if (body.length < 4_000_000) body += chunk
        })
        res.on('end', () => {
          const status = res.statusCode ?? 0
          if (status === 401 || status === 403) {
            resolve({ ok: false, data: null, error: '密钥校验失败（401）' })
            return
          }
          if (status >= 400) {
            resolve({ ok: false, data: null, error: `网关返回 HTTP ${status}` })
            return
          }
          try {
            resolve({ ok: true, data: JSON.parse(body) as T, error: null })
          } catch {
            resolve({ ok: false, data: null, error: '返回内容无法解析' })
          }
        })
      }
    )
    req.on('timeout', () => {
      req.destroy()
      resolve({ ok: false, data: null, error: '连接超时' })
    })
    req.on('error', (err) => {
      resolve({ ok: false, data: null, error: (err as NodeJS.ErrnoException).code ?? '连接失败' })
    })
    req.end()
  })
}

export class GatewayClient {
  private config: GatewayConfig = { enabled: false, url: '', secret: '' }
  private status: GatewayStatus = {
    connected: false,
    version: null,
    error: null,
    up: 0,
    down: 0,
    memory: null,
    node: null,
    since: null
  }

  private socket: WebSocket | null = null
  private pollTimer: NodeJS.Timeout | null = null
  private retryTimer: NodeJS.Timeout | null = null
  private retryDelay = 3000

  private samples: TrafficSample[] = []
  private minutes = new Map<number, { up: number; down: number }>()
  private deviceTotals = new Map<string, { up: number; down: number }>()
  private domainTotals = new Map<string, { up: number; down: number; count: number }>()
  private connBytes = new Map<string, { up: number; down: number }>()
  private listener: ((payload: TrafficPayload) => void) | null = null
  private statusListener: ((status: GatewayStatus) => void) | null = null

  onTraffic(cb: (payload: TrafficPayload) => void): void {
    this.listener = cb
  }

  onStatus(cb: (status: GatewayStatus) => void): void {
    this.statusListener = cb
  }

  getStatus(): GatewayStatus {
    return { ...this.status }
  }

  configure(config: GatewayConfig): void {
    const changed =
      normalizeUrl(config.url) !== normalizeUrl(this.config.url) || config.secret !== this.config.secret
    this.config = { ...config, url: normalizeUrl(config.url) }
    if (changed || (!config.enabled && this.socket)) {
      this.stop()
      if (config.enabled && config.url) void this.start()
    }
  }

  async test(config: GatewayConfig): Promise<GatewayStatus> {
    const url = normalizeUrl(config.url)
    if (!url) {
      return { ...this.status, connected: false, error: '请填写网关地址' }
    }
    const result = await httpJson<ClashVersion>(`${url}/version`, config.secret, 3500)
    if (!result.ok || !result.data) {
      return { ...this.status, connected: false, error: result.error ?? '无法连接' }
    }
    let node: string | null = null
    const proxies = await httpJson<{ proxies?: Record<string, { now?: string; type?: string }> }>(
      `${url}/proxies`,
      config.secret,
      3000
    )
    if (proxies.ok && proxies.data?.proxies) {
      const groups = Object.values(proxies.data.proxies)
      const live = groups.find((p) => p.now && p.type !== 'Selector' && p.type !== 'URLTest')
      node = live?.now ?? null
    }
    return {
      connected: true,
      version: result.data.version ?? (result.data.meta ? 'Mihomo' : 'Clash'),
      error: null,
      up: this.status.up,
      down: this.status.down,
      memory: this.status.memory,
      node,
      since: this.status.since
    }
  }

  async start(): Promise<void> {
    if (!this.config.enabled || !this.config.url) return
    if (this.socket) return
    const url = this.config.url
    const check = await httpJson<ClashVersion>(`${url}/version`, this.config.secret, 3500)
    if (!check.ok) {
      this.setStatus({ connected: false, error: check.error ?? '无法连接网关' })
      this.scheduleRetry()
      return
    }
    this.setStatus({
      connected: true,
      version: check.data?.version ?? (check.data?.meta ? 'Mihomo' : 'Clash'),
      error: null,
      since: Date.now()
    })
    this.retryDelay = 3000
    this.openSocket()
    this.startPolling()
  }

  stop(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer)
    if (this.pollTimer) clearInterval(this.pollTimer)
    this.retryTimer = null
    this.pollTimer = null
    if (this.socket) {
      this.socket.removeAllListeners()
      try {
        this.socket.close()
      } catch {
        /* ignore */
      }
      this.socket = null
    }
    this.setStatus({ connected: false, error: null, since: null })
  }

  reconnect(): void {
    this.stop()
    this.retryDelay = 3000
    if (this.config.enabled && this.config.url) void this.start()
  }

  private scheduleRetry(): void {
    if (!this.config.enabled) return
    if (this.retryTimer) return
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null
      void this.start()
    }, this.retryDelay)
    this.retryDelay = Math.min(this.retryDelay * 1.6, 30_000)
  }

  private openSocket(): void {
    const base = this.config.url.replace(/^http/i, 'ws')
    const secret = this.config.secret ? `?token=${encodeURIComponent(this.config.secret)}` : ''
    let socket: WebSocket
    try {
      socket = new WebSocket(`${base}/traffic${secret}`, { rejectUnauthorized: false })
    } catch {
      this.scheduleRetry()
      return
    }
    this.socket = socket
    socket.on('message', (raw) => {
      try {
        const data = JSON.parse(raw.toString()) as { up?: number; down?: number; upTotal?: number; downTotal?: number }
        this.pushSample(Number(data.up ?? 0), Number(data.down ?? 0))
      } catch {
        /* ignore malformed frame */
      }
    })
    socket.on('close', () => {
      this.socket = null
      if (!this.config.enabled) return
      this.setStatus({ connected: false, error: '实时连接已断开' })
      this.scheduleRetry()
    })
    socket.on('error', () => {
      /* close handler will retry */
    })
  }

  private startPolling(): void {
    if (this.pollTimer) clearInterval(this.pollTimer)
    void this.poll()
    this.pollTimer = setInterval(() => void this.poll(), 2200)
  }

  private async poll(): Promise<void> {
    if (!this.config.enabled) return
    const result = await httpJson<ClashConnectionsResponse>(
      `${this.config.url}/connections`,
      this.config.secret,
      4000
    )
    if (!result.ok || !result.data) return
    const connections = result.data.connections ?? []
    const seen = new Set<string>()
    for (const conn of connections) {
      seen.add(conn.id)
      const prev = this.connBytes.get(conn.id) ?? { up: 0, down: 0 }
      const deltaUp = Math.max(0, Number(conn.upload ?? 0) - prev.up)
      const deltaDown = Math.max(0, Number(conn.download ?? 0) - prev.down)
      this.connBytes.set(conn.id, { up: Number(conn.upload ?? 0), down: Number(conn.download ?? 0) })
      if (!deltaUp && !deltaDown) continue

      const ip = conn.metadata?.sourceIP
      if (ip) {
        const entry = this.deviceTotals.get(ip) ?? { up: 0, down: 0 }
        entry.up += deltaUp
        entry.down += deltaDown
        this.deviceTotals.set(ip, entry)
      }
      const host = conn.metadata?.host || conn.metadata?.destinationIP
      if (host) {
        const entry = this.domainTotals.get(host) ?? { up: 0, down: 0, count: 0 }
        entry.up += deltaUp
        entry.down += deltaDown
        this.domainTotals.set(host, entry)
      }
    }
    for (const id of this.connBytes.keys()) {
      if (!seen.has(id)) this.connBytes.delete(id)
    }
    const hostCounts = new Map<string, number>()
    for (const conn of connections) {
      const host = conn.metadata?.host
      if (host) hostCounts.set(host, (hostCounts.get(host) ?? 0) + 1)
    }
    for (const [host, count] of hostCounts) {
      const entry = this.domainTotals.get(host)
      if (entry) entry.count = count
    }
    this.emitTraffic()
  }

  private pushSample(up: number, down: number): void {
    const t = Date.now()
    this.samples.push({ t, up, down })
    if (this.samples.length > SAMPLE_KEEP) this.samples.splice(0, this.samples.length - SAMPLE_KEEP)
    this.setStatus({ up, down })

    const minuteTs = Math.floor(t / 60_000) * 60_000
    const bucket = this.minutes.get(minuteTs) ?? { up: 0, down: 0 }
    bucket.up += up
    bucket.down += down
    this.minutes.set(minuteTs, bucket)
    if (this.minutes.size > MINUTE_KEEP) {
      const oldest = [...this.minutes.keys()].sort((a, b) => a - b)[0]
      this.minutes.delete(oldest)
    }
    this.emitTraffic()
  }

  private emitTraffic(): void {
    if (!this.listener) return
    const devices: TrafficBucket[] = [...this.deviceTotals.entries()]
      .map(([ip, value]) => ({
        key: ip,
        label: ip,
        up: value.up,
        down: value.down,
        count: 1
      }))
      .sort((a, b) => b.down + b.up - (a.down + a.up))
      .slice(0, 40)

    const domains: TrafficBucket[] = [...this.domainTotals.entries()]
      .map(([host, value]) => ({
        key: host,
        label: host,
        up: value.up,
        down: value.down,
        count: value.count
      }))
      .sort((a, b) => b.down + b.up - (a.down + a.up))
      .slice(0, 40)

    const totalUp = devices.reduce((sum, d) => sum + d.up, 0)
    const totalDown = devices.reduce((sum, d) => sum + d.down, 0)
    const minuteSamples: TrafficSample[] = [...this.minutes.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([t, value]) => ({ t, up: Math.round(value.up / 60), down: Math.round(value.down / 60) }))

    this.listener({
      samples: this.samples.slice(-SAMPLE_KEEP),
      minutes: minuteSamples,
      devices,
      domains,
      totalUp,
      totalDown
    })
    if (this.deviceTotals.size > DEVICE_KEEP) {
      const oldest = [...this.deviceTotals.keys()].slice(0, this.deviceTotals.size - DEVICE_KEEP)
      oldest.forEach((ip) => this.deviceTotals.delete(ip))
    }
  }

  private setStatus(patch: Partial<GatewayStatus>): void {
    this.status = { ...this.status, ...patch }
    this.statusListener?.({ ...this.status })
  }
}
