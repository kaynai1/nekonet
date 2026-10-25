import dgram from 'node:dgram'
import fs from 'node:fs'
import { BrowserWindow, Notification, app, dialog, shell } from 'electron'
import type {
  AppStateSnapshot,
  Device,
  GatewayConfig,
  GatewayStatus,
  RouterClientsStatus,
  RouterConfig,
  RouterDetection,
  RouterTrafficHistory,
  RouterTrafficStatus,
  ScanResult,
  Settings,
  SettingsPatch,
  TimelineEvent,
  TrafficBucket,
  TrafficPayload
} from '@shared/types'
import { runScan } from './scanner/scan'
import { fetchRouterClients } from './scanner/router-clients'
import { detectRouterBrand, normalizeRouterUrl } from './scanner/router-detect'
import { RouterMonitor } from './scanner/router-traffic'
import { GatewayClient } from './gateway/clash'
import {
  MihomoCore,
  disableSystemProxy,
  enableSystemProxy,
  lastSystemProxyError
} from './gateway/core'
import { Store } from './store'

const EMPTY_TRAFFIC: TrafficPayload = {
  samples: [],
  minutes: [],
  devices: [],
  domains: [],
  totalUp: 0,
  totalDown: 0
}

// 光猫计数每 30 秒采样一次：保留 2 小时明细与 24 小时分钟均值
const ROUTER_SAMPLE_KEEP = 240
const ROUTER_MINUTE_KEEP = 1440
const ROUTER_HISTORY_SAVE_MS = 2 * 60_000

function idleProgress(): AppStateSnapshot['progress'] {
  return { phase: 'idle', done: 0, total: 0, message: '' }
}

export class AppState {
  private store: Store
  private gateway = new GatewayClient()
  private core = new MihomoCore()
  private routerMonitor = new RouterMonitor((status) => {
    this.snapshot.routerTraffic = status
    if (status.connected && status.at) this.recordRouterSample(status)
    this.push()
  })
  private snapshot: AppStateSnapshot
  private routerHistory: RouterTrafficHistory
  private routerDetection: RouterDetection | null = null
  private routerMinuteAcc = new Map<number, { up: number; down: number; count: number }>()
  private lastRouterSampleAt = 0
  private routerHistorySavedAt = 0
  private scanTimer: NodeJS.Timeout | null = null
  private scanning = false
  private cancelRequested = false
  private firstScanDone = false
  private coreSyncing = false
  private onUpdate: ((state: AppStateSnapshot) => void) | null = null

  constructor(store: Store) {
    this.store = store
    const settings = store.data.settings
    this.routerHistory = store.data.routerHistory
    this.snapshot = {
      scanning: false,
      progress: idleProgress(),
      network: store.data.network ?? null,
      devices: store.data.devices,
      events: store.data.events,
      gateway: this.gateway.getStatus(),
      core: this.core.getStatus(),
      traffic: EMPTY_TRAFFIC,
      settings,
      routerClients: null,
      routerTraffic: null,
      routerDetection: null,
      routerHistory: this.routerHistory,
      lastScanAt: store.data.lastScanAt
    }
    this.firstScanDone = (store.data.lastScanAt ?? 0) > 0
  }

  init(onUpdate: (state: AppStateSnapshot) => void): void {
    this.onUpdate = onUpdate
    this.gateway.onTraffic((payload) => {
      const normalized = this.normalizeTraffic(payload)
      this.snapshot.traffic = normalized
      this.snapshot.devices = this.mergeTraffic(this.snapshot.devices, normalized)
      this.push()
    })
    this.gateway.onStatus((status: GatewayStatus) => {
      this.snapshot.gateway = status
      this.push()
    })
    this.core.onStatus((status) => {
      this.snapshot.core = { ...status, systemProxy: status.error ? false : this.snapshot.core.systemProxy }
      // 仅在内核异常退出时收尾；主动重启/停止不改变用户的系统代理选择
      if (!status.running && status.error && this.snapshot.settings.core.enabled) {
        this.gateway.configure({ enabled: false, url: '', secret: '' })
        if (this.snapshot.settings.core.systemProxy) {
          const next: Settings = {
            ...this.snapshot.settings,
            core: { ...this.snapshot.settings.core, systemProxy: false }
          }
          this.snapshot.settings = next
          this.store.save({ settings: next })
        }
      }
      this.push()
    })
    this.gateway.configure(this.snapshot.settings.gateway)
    void this.reconcileProxy()
    void this.syncCore()
    if (this.snapshot.settings.router.enabled) {
      void this.refreshRouterDetection()
        .catch(() => undefined)
        .finally(() => this.configureRouterMonitor())
    } else {
      this.configureRouterMonitor()
    }
    this.schedule()
    setTimeout(() => void this.scan(), 900)
  }

  private async refreshRouterDetection(force = false): Promise<void> {
    const router = this.snapshot.settings.router
    if (!router.enabled) {
      this.routerDetection = null
      this.snapshot.routerDetection = null
      return
    }
    const detection = await detectRouterBrand(
      router.url,
      {
        ssid: this.snapshot.network?.active?.wifi?.ssid ?? null,
        wanIsp: this.snapshot.network?.wan?.isp ?? null
      },
      force
    )
    this.routerDetection = detection
    this.snapshot.routerDetection = detection
    this.push()
  }

  // 非中兴固件的登录表单完全不同，继续尝试只会触发网关锁定，识别到就停下
  private configureRouterMonitor(): void {
    const router = this.snapshot.settings.router
    const detection = this.routerDetection
    let blocked: { reason: string } | null = null
    if (
      detection &&
      detection.reachable &&
      detection.url === normalizeRouterUrl(router.url) &&
      detection.brand !== 'zte' &&
      detection.brand !== 'unknown'
    ) {
      blocked = { reason: detection.note }
    }
    this.routerMonitor.configure(router, this.snapshot.settings.flowLabels, blocked)
  }

  private recordRouterSample(status: RouterTrafficStatus): void {
    const at = status.at
    if (!at || at === this.lastRouterSampleAt) return
    this.lastRouterSampleAt = at

    const samples = this.routerHistory.samples
    samples.push({ t: at, up: Math.round(status.up), down: Math.round(status.down) })
    if (samples.length > ROUTER_SAMPLE_KEEP) samples.splice(0, samples.length - ROUTER_SAMPLE_KEEP)

    const minuteTs = Math.floor(at / 60_000) * 60_000
    const acc = this.routerMinuteAcc.get(minuteTs) ?? { up: 0, down: 0, count: 0 }
    acc.up += status.up
    acc.down += status.down
    acc.count += 1
    this.routerMinuteAcc.set(minuteTs, acc)
    if (this.routerMinuteAcc.size > 120) {
      const oldest = [...this.routerMinuteAcc.keys()].sort((a, b) => a - b)[0]
      this.routerMinuteAcc.delete(oldest)
    }

    const minutes = this.routerHistory.minutes
    const average = {
      t: minuteTs,
      up: Math.round(acc.up / acc.count),
      down: Math.round(acc.down / acc.count)
    }
    const last = minutes[minutes.length - 1]
    if (last && last.t === minuteTs) minutes[minutes.length - 1] = average
    else minutes.push(average)
    if (minutes.length > ROUTER_MINUTE_KEEP) minutes.splice(0, minutes.length - ROUTER_MINUTE_KEEP)

    if (at - this.routerHistorySavedAt >= ROUTER_HISTORY_SAVE_MS) {
      this.routerHistorySavedAt = at
      this.store.save({ routerHistory: this.routerHistory })
    }
  }

  getState(): AppStateSnapshot {
    return this.snapshot
  }

  private push(): void {
    this.onUpdate?.(this.snapshot)
  }

  // 本机应用走代理时来源显示为回环地址，归并到本机局域网 IP 上
  private normalizeTraffic(payload: TrafficPayload): TrafficPayload {
    const localIp = this.snapshot.network?.active?.ip
    if (!localIp) return payload
    const buckets = new Map<string, TrafficBucket>()
    for (const bucket of payload.devices) {
      const loopback = bucket.key === '127.0.0.1' || bucket.key === '::1' || bucket.key === 'localhost'
      const key = loopback ? localIp : bucket.key
      const existing = buckets.get(key)
      if (existing) {
        existing.up += bucket.up
        existing.down += bucket.down
        existing.count += bucket.count
      } else {
        buckets.set(key, { ...bucket, key })
      }
    }
    return { ...payload, devices: [...buckets.values()] }
  }

  private mergeTraffic(devices: Device[], payload: TrafficPayload): Device[] {    if (!payload.devices.length) return devices
    const byIp = new Map(payload.devices.map((bucket) => [bucket.key, bucket]))
    return devices.map((device) => {
      const bucket = byIp.get(device.ip)
      if (!bucket) return device
      return { ...device, traffic: { up: bucket.up, down: bucket.down } }
    })
  }

  private schedule(): void {
    if (this.scanTimer) clearInterval(this.scanTimer)
    this.scanTimer = null
    const seconds = this.snapshot.settings.intervalSec
    if (!seconds || seconds <= 0) return
    this.scanTimer = setInterval(() => {
      if (!this.scanning) void this.scan()
    }, Math.max(20, seconds) * 1000)
  }

  async scan(): Promise<ScanResult | null> {
    if (this.scanning) return null
    this.scanning = true
    this.cancelRequested = false
    this.snapshot.scanning = true
    this.snapshot.progress = { phase: 'interfaces', done: 0, total: 1, message: '准备扫描' }
    this.push()

    try {
      const result = await runScan({
        subnet: this.snapshot.settings.subnet,
        enableMdns: this.snapshot.settings.enableMdns,
        enableSsdp: this.snapshot.settings.enableSsdp,
        enableNetbios: this.snapshot.settings.enableNetbios,
        enablePortScan: this.snapshot.settings.enablePortScan,
        router: this.snapshot.settings.router,
        known: this.snapshot.devices,
        onProgress: (progress) => {
          this.snapshot.progress = progress
          this.push()
        },
        isCancelled: () => this.cancelRequested
      })

      if (result.cancelled) {
        return null
      }

      const mergedDevices = this.mergeTraffic(result.devices, this.snapshot.traffic)
      const events = this.mergeEvents(result.events, mergedDevices)
      this.snapshot.network = result.network
      this.snapshot.devices = mergedDevices
      this.snapshot.events = events
      this.snapshot.routerClients = result.routerClients
      this.snapshot.routerDetection = result.routerDetection
      if (this.snapshot.settings.router.enabled) {
        this.routerDetection = result.routerDetection
        this.configureRouterMonitor()
      }
      this.snapshot.lastScanAt = Date.now()
      this.snapshot.progress = { phase: 'done', done: 1, total: 1, message: '扫描完成' }

      this.store.save({
        devices: mergedDevices,
        events,
        network: result.network,
        lastScanAt: this.snapshot.lastScanAt
      })

      this.notifyNewDevices(result.events)
      this.firstScanDone = true

      const scanResult: ScanResult = {
        network: result.network,
        devices: mergedDevices,
        events
      }
      return scanResult
    } catch (error) {
      this.snapshot.progress = {
        phase: 'done',
        done: 1,
        total: 1,
        message: `扫描失败�?{(error as Error).message}`
      }
      return null
    } finally {
      this.scanning = false
      this.snapshot.scanning = false
      this.push()
    }
  }

  private mergeEvents(incoming: TimelineEvent[], devices: Device[]): TimelineEvent[] {
    const byId = new Map(devices.map((device) => [device.id, device]))
    const relabel = (event: TimelineEvent): TimelineEvent => {
      const device = event.deviceId ? byId.get(event.deviceId) : undefined
      if (!device) return event
      const label = device.customName || device.hostname || device.vendor || device.ip
      const suffix =
        event.kind === 'new-device' ? '首次接入网络' : event.kind === 'device-online' ? '上线' : '离线'
      const detail =
        event.kind === 'new-device' && device.vendor ? `${device.vendor} · ${device.ip}` : device.ip
      return { ...event, title: `${label} ${suffix}`, detail }
    }

    if (!incoming.length) return this.snapshot.events.map(relabel)
    const map = new Map<string, TimelineEvent>()
    for (const event of [...incoming, ...this.snapshot.events]) {
      if (!map.has(event.id)) map.set(event.id, event)
    }
    return [...map.values()]
      .sort((a, b) => b.at - a.at)
      .slice(0, 80)
      .map(relabel)
  }

  private notifyNewDevices(events: TimelineEvent[]): void {
    if (!this.snapshot.settings.notifications) return
    if (!this.firstScanDone) return
    for (const event of events) {
      if (event.kind !== 'new-device') continue
      if (!Notification.isSupported()) continue
      new Notification({
        title: '有新设备接入网络',
        body: event.detail ? `${event.title}\n${event.detail}` : event.title,
        silent: false
      }).show()
    }
  }

  cancelScan(): void {
    this.cancelRequested = true
  }

  updateSettings(patch: SettingsPatch): Settings {
    const next: Settings = {
      ...this.snapshot.settings,
      ...patch,
      gateway: { ...this.snapshot.settings.gateway, ...(patch.gateway ?? {}) },
      core: { ...this.snapshot.settings.core, ...(patch.core ?? {}) },
      router: { ...this.snapshot.settings.router, ...(patch.router ?? {}) }
    }
    if (next.core.enabled) next.gateway = { ...next.gateway, enabled: false }
    const gatewayChanged =
      next.gateway.url !== this.snapshot.settings.gateway.url ||
      next.gateway.secret !== this.snapshot.settings.gateway.secret ||
      next.gateway.enabled !== this.snapshot.settings.gateway.enabled ||
      !next.core.enabled
    const coreChanged =
      next.core.enabled !== this.snapshot.settings.core.enabled ||
      next.core.subscriptionUrl !== this.snapshot.settings.core.subscriptionUrl ||
      next.core.systemProxy !== this.snapshot.settings.core.systemProxy
    const previousRouter = this.snapshot.settings.router
    const routerChanged =
      next.router.enabled !== previousRouter.enabled ||
      next.router.url !== previousRouter.url ||
      next.router.username !== previousRouter.username ||
      next.router.password !== previousRouter.password
    const labelsChanged =
      JSON.stringify(next.flowLabels ?? {}) !== JSON.stringify(this.snapshot.settings.flowLabels ?? {})

    this.snapshot.settings = next
    this.store.save({ settings: next })

    if (coreChanged) void this.syncCore()
    else if (gatewayChanged && !next.core.enabled) this.gateway.configure(next.gateway)
    if (routerChanged) {
      void this.refreshRouterDetection()
        .catch(() => undefined)
        .finally(() => this.configureRouterMonitor())
    } else if (labelsChanged) {
      this.configureRouterMonitor()
    }
    if (patch.intervalSec !== undefined) this.schedule()
    this.push()
    return next
  }

  // 上次异常退出可能残留系统代理，未启用时先还原
  private async reconcileProxy(): Promise<void> {
    const core = this.snapshot.settings.core
    if (core.enabled && core.systemProxy) return
    await disableSystemProxy()
  }

  private async syncCore(): Promise<void> {
    if (this.coreSyncing) return
    this.coreSyncing = true
    try {
      const config = this.snapshot.settings.core
      if (!config.enabled) {
        this.core.stop()
        await disableSystemProxy()
        this.snapshot.core = { ...this.core.getStatus(), systemProxy: false }
        if (this.snapshot.settings.gateway.enabled) this.gateway.configure(this.snapshot.settings.gateway)
        else this.gateway.configure({ enabled: false, url: '', secret: '' })
        this.push()
        return
      }

      if (this.snapshot.core.running) this.core.stop()
      const status = await this.core.start(config)
      if (!status.running) {
        this.snapshot.core = { ...status, systemProxy: false }
        this.gateway.configure({ enabled: false, url: '', secret: '' })
        await disableSystemProxy()
        this.push()
        return
      }

      this.gateway.configure({ enabled: true, url: this.core.controller.url, secret: this.core.controller.secret })
      let proxyOn = false
      if (config.systemProxy) proxyOn = await enableSystemProxy()
      else await disableSystemProxy()
      const proxyFailure = config.systemProxy && !proxyOn ? lastSystemProxyError() : null
      this.snapshot.core = {
        ...this.core.getStatus(),
        systemProxy: proxyOn,
        error: proxyFailure ? `系统代理设置失败：${proxyFailure}` : this.core.getStatus().error
      }
      this.push()
    } finally {
      this.coreSyncing = false
    }
  }

  renameDevice(id: string, name: string): Device[] {
    const trimmed = name.trim()
    this.snapshot.devices = this.snapshot.devices.map((device) =>
      device.id === id ? { ...device, customName: trimmed || null } : device
    )
    this.store.save({ devices: this.snapshot.devices })
    this.push()
    return this.snapshot.devices
  }

  ignoreDevice(id: string, ignored: boolean): Device[] {
    this.snapshot.devices = this.snapshot.devices.map((device) =>
      device.id === id ? { ...device, ignored } : device
    )
    this.store.save({ devices: this.snapshot.devices })
    this.push()
    return this.snapshot.devices
  }

  async testGateway(config: GatewayConfig): Promise<GatewayStatus> {
    return this.gateway.test(config)
  }

  async testRouter(config: RouterConfig): Promise<RouterClientsStatus> {
    const result = await fetchRouterClients(config)
    return { count: result.clients.length, error: result.error, at: Date.now() }
  }

  async detectRouter(url: string): Promise<RouterDetection> {
    const detection = await detectRouterBrand(
      url,
      {
        ssid: this.snapshot.network?.active?.wifi?.ssid ?? null,
        wanIsp: this.snapshot.network?.wan?.isp ?? null
      },
      true
    )
    this.routerDetection = detection
    this.snapshot.routerDetection = detection
    this.configureRouterMonitor()
    this.push()
    return detection
  }

  reconnectGateway(): void {
    this.gateway.reconnect()
  }

  private findDevice(ip: string): Device | undefined {
    return this.snapshot.devices.find((device) => device.ip === ip)
  }

  async wakeDevice(ip: string): Promise<boolean> {
    const device = this.findDevice(ip)
    if (!device?.mac) return false
    const macHex = device.mac.replace(/[^0-9a-f]/gi, '')
    if (macHex.length !== 12) return false
    const macBuffer = Buffer.from(macHex, 'hex')
    const packet = Buffer.alloc(6 + 16 * 6, 0xff)
    for (let i = 0; i < 16; i++) macBuffer.copy(packet, 6 + i * 6)
    return new Promise((resolve) => {
      const socket = dgram.createSocket('udp4')
      socket.once('error', () => {
        try {
          socket.close()
        } catch {
          /* ignore */
        }
        resolve(false)
      })
      socket.bind(() => {
        socket.setBroadcast(true)
        let sent = 0
        for (const port of [9, 7]) {
          socket.send(packet, port, '255.255.255.255', () => {
            sent += 1
            if (sent === 2) {
              socket.close()
              resolve(true)
            }
          })
        }
      })
    })
  }

  async exportData(): Promise<string | null> {
    const window = BrowserWindow.getAllWindows()[0]
    const stamp = new Date().toISOString().slice(0, 10)
    const result = await dialog.showSaveDialog(window, {
      title: '导出网络数据',
      defaultPath: `nekonet-${stamp}.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }]
    })
    if (result.canceled || !result.filePath) return null
    await fs.promises.writeFile(result.filePath, JSON.stringify(this.snapshot, null, 2), 'utf8')
    return result.filePath
  }

  async openExternal(url: string): Promise<void> {
    if (!/^https?:\/\//i.test(url)) return
    await shell.openExternal(url)
  }

  async dispose(): Promise<void> {
    if (this.scanTimer) clearInterval(this.scanTimer)
    this.routerMonitor.dispose()
    this.gateway.stop()
    this.core.dispose()
    await disableSystemProxy()
    this.store.save({ routerHistory: this.routerHistory })
    await this.store.flush()
  }
}
