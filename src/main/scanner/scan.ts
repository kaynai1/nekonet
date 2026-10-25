import dns from 'node:dns/promises'
import type {
  Device,
  DeviceType,
  NetworkSnapshot,
  PortInfo,
  RouterClientsStatus,
  RouterConfig,
  RouterDetection,
  ScanProgress,
  TimelineEvent
} from '@shared/types'
import { collectInterfaces } from './interfaces'
import { readArpTable } from './arp'
import { discoverHost, scanPorts, touchNeighbors } from './probe'
import { startMdnsScan } from './mdns'
import { scanSsdp } from './ssdp'
import { resolveNetbiosNames } from './netbios'
import { classifyDevice } from './classify'
import { collectRouter } from './router'
import { fetchWanInfo } from './wan'
import { fetchRouterClients } from './router-clients'
import { detectRouterBrand } from './router-detect'
import { lookupVendor, normalizeMac } from './oui'
import { hostsInSubnet, intToIp, ipToInt, isValidIp, pool } from './net'

export interface ScanOptions {
  subnet: string | null
  enableMdns: boolean
  enableSsdp: boolean
  enableNetbios: boolean
  enablePortScan: boolean
  router?: RouterConfig
  known: Device[]
  onProgress: (progress: ScanProgress) => void
  isCancelled?: () => boolean
}

export interface ScanOutput {
  network: NetworkSnapshot
  devices: Device[]
  events: TimelineEvent[]
  routerClients: RouterClientsStatus | null
  routerDetection: RouterDetection | null
  cancelled: boolean
}

const MAX_HOSTS = 254

function makeEmitter(onProgress: (p: ScanProgress) => void): (p: ScanProgress) => void {
  let lastAt = 0
  let lastPhase = ''
  return (progress) => {
    const now = Date.now()
    if (progress.phase === lastPhase && now - lastAt < 140 && progress.done !== progress.total) return
    lastAt = now
    lastPhase = progress.phase
    onProgress(progress)
  }
}

function subnetTargets(ip: string, prefix: number): string[] {
  const effective = Math.min(Math.max(prefix, 24), 30)
  const hosts = hostsInSubnet(ip, effective)
  return hosts.slice(0, MAX_HOSTS)
}

const LOCAL_NAME = /\.(local|lan|home|localdomain|home\.arpa)$/i

async function reverseName(ip: string): Promise<string | null> {
  try {
    const names = await Promise.race([
      dns.reverse(ip),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 800))
    ])
    const raw = names?.[0]?.replace(/\.$/, '')
    if (!raw || raw.includes('_')) return null
    if (raw.includes('.')) {
      if (!LOCAL_NAME.test(raw)) return null
      return raw.replace(LOCAL_NAME, '')
    }
    return raw
  } catch {
    return null
  }
}

function withinSubnet(ip: string, networkIp: string, prefix: number): boolean {
  if (!isValidIp(ip)) return false
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0
  return ((ipToInt(ip) & mask) >>> 0) === ((ipToInt(networkIp) & mask) >>> 0)
}

export async function runScan(options: ScanOptions): Promise<ScanOutput> {
  const emit = makeEmitter(options.onProgress)
  const cancelled = (): boolean => options.isCancelled?.() ?? false
  const now = Date.now()

  emit({ phase: 'interfaces', done: 0, total: 1, message: '正在读取网卡信息' })
  const { hostname, interfaces, active, ipv6 } = await collectInterfaces()
  const iface = active
  if (!iface) {
    emit({ phase: 'done', done: 1, total: 1, message: '未找到可用的网络接口' })
    return {
      network: {
        hostname,
        platform: process.platform,
        interfaces,
        active: null,
        wan: null,
        router: null,
        ipv6,
        scannedAt: Date.now(),
        deviceCount: 0
      },
      devices: [],
      events: [],
      routerClients: null,
      routerDetection: null,
      cancelled: false
    }
  }

  let scanIp = iface.ip
  let scanPrefix = iface.prefix
  if (options.subnet && options.subnet.includes('/')) {
    const [base, bits] = options.subnet.split('/')
    const parsedBits = Number(bits)
    if (isValidIp(base) && Number.isFinite(parsedBits)) {
      scanIp = base
      scanPrefix = parsedBits
    }
  }

  const targets = subnetTargets(scanIp, scanPrefix)
  const gateway = iface.gateway

  const mdnsPromise = options.enableMdns ? startMdnsScan(iface.ip, 8000) : Promise.resolve([])
  const ssdpPromise = options.enableSsdp ? scanSsdp(iface.ip, 5500) : Promise.resolve([])
  const wanPromise = fetchWanInfo()
  const routerPromise = gateway ? collectRouter(gateway) : Promise.resolve(null)
  const routerClientsPromise = options.router?.enabled
    ? fetchRouterClients(options.router).catch(() => ({ clients: [], error: '路由器客户端列表读取失败' }))
    : Promise.resolve(null)
  const routerDetectionPromise = options.router?.enabled
    ? detectRouterBrand(options.router.url, { ssid: iface.wifi?.ssid ?? null })
    : Promise.resolve(null)

  let responded = 0
  let aliveCount = 0
  emit({ phase: 'sweep', done: 0, total: targets.length, message: '正在扫描局域网主机' })
  const sweep = await pool(targets, 32, async (ip) => {
    const result = await discoverHost(ip)
    responded += 1
    if (result.alive) aliveCount += 1
    emit({
      phase: 'sweep',
      done: responded,
      total: targets.length,
      message: `正在扫描 ${ip}（已发现 ${aliveCount} 台响应）`
    })
    return { ip, ...result }
  })

  if (cancelled()) {
    return {
      network: {
        hostname,
        platform: process.platform,
        interfaces,
        active: iface,
        wan: null,
        router: null,
        ipv6,
        scannedAt: Date.now(),
        deviceCount: 0
      },
      devices: options.known,
      events: [],
      routerClients: null,
      routerDetection: null,
      cancelled: true
    }
  }

  emit({ phase: 'arp', done: 0, total: 1, message: '正在刷新邻居缓存' })
  await touchNeighbors(targets)
  await new Promise((resolve) => setTimeout(resolve, 450))
  const arp = await readArpTable()
  const arpInSubnet = arp.filter((entry) => withinSubnet(entry.ip, scanIp, scanPrefix))
  const arpByIp = new Map(arpInSubnet.map((entry) => [entry.ip, entry]))
  const aliveByIp = new Map(sweep.filter((s) => s.alive).map((s) => [s.ip, s]))

  const selfMac = iface.mac ? normalizeMac(iface.mac) : null

  const mask = scanPrefix === 0 ? 0 : (0xffffffff << (32 - scanPrefix)) >>> 0
  const networkInt = (ipToInt(scanIp) & mask) >>> 0
  const broadcastIp = intToIp((networkInt | (~mask >>> 0)) >>> 0)

  const candidateIps = new Set<string>()
  for (const entry of arpInSubnet) candidateIps.add(entry.ip)
  for (const item of sweep) if (item.alive) candidateIps.add(item.ip)
  if (withinSubnet(iface.ip, scanIp, scanPrefix)) candidateIps.add(iface.ip)
  if (gateway) candidateIps.add(gateway)
  candidateIps.delete(broadcastIp)
  candidateIps.delete(intToIp(networkInt))

  const ipList = [...candidateIps].sort((a, b) => ipToInt(a) - ipToInt(b))

  emit({ phase: 'fingerprint', done: 0, total: ipList.length, message: '正在识别设备指纹' })
  let fingerprinted = 0
  const portMap = new Map<string, PortInfo[]>()
  if (options.enablePortScan) {
    await pool(ipList, 6, async (ip) => {
      const ports = await scanPorts(ip)
      portMap.set(ip, ports)
      fingerprinted += 1
      emit({
        phase: 'fingerprint',
        done: fingerprinted,
        total: ipList.length,
        message: `正在识别 ${ip}（${ports.length} 个开放端口）`
      })
    })
  }

  emit({ phase: 'mdns', done: 0, total: 1, message: '正在收集 mDNS 广播' })
  const mdnsEntries = await mdnsPromise
  const ssdpEntries = await ssdpPromise
  const mdnsByIp = new Map(mdnsEntries.map((entry) => [entry.ip, entry]))
  const ssdpByIp = new Map(ssdpEntries.map((entry) => [entry.ip, entry]))

  const needNames = ipList.filter((ip) => {
    const mdns = mdnsByIp.get(ip)
    return !mdns?.name && ip !== iface.ip
  })
  const netbiosMap = options.enableNetbios ? await resolveNetbiosNames(needNames) : new Map<string, string>()

  emit({ phase: 'names', done: 0, total: 1, message: '正在解析设备名称' })
  const reverseTargets = needNames.filter((ip) => !netbiosMap.has(ip) && !mdnsByIp.get(ip)?.name)
  const reverseMap = new Map<string, string>()
  await pool(reverseTargets, 10, async (ip) => {
    const name = await reverseName(ip)
    if (name) reverseMap.set(ip, name)
  })

  emit({ phase: 'router', done: 0, total: 1, message: '正在查询路由器信息' })
  const [router, wan] = await Promise.all([routerPromise, wanPromise])
  emit({ phase: 'router', done: 0, total: 1, message: '正在读取路由器客户端列表' })
  const [routerOutcome, routerDetection] = await Promise.all([
    routerClientsPromise,
    routerDetectionPromise
  ])

  const devices: Device[] = []
  const customByMac = new Map<string, Device>()
  for (const item of options.known) {
    if (item.mac) customByMac.set(item.mac, item)
  }
  const knownByIp = new Map(options.known.map((item) => [item.ip, item]))

  for (const ip of ipList) {
    const arpEntry = arpByIp.get(ip)
    const mac = ip === iface.ip ? selfMac : arpEntry?.mac ?? null
    const mdns = mdnsByIp.get(ip)
    const ssdp = ssdpByIp.get(ip)
    const vendor = mac ? lookupVendor(mac) : null
    const ports = portMap.get(ip) ?? []
    const netbios = netbiosMap.get(ip) ?? null
    const reverse = reverseMap.get(ip) ?? null

    const classification = classifyDevice({
      isGateway: ip === gateway,
      isSelf: ip === iface.ip,
      hostname: reverse,
      netbios,
      vendor,
      ports,
      mdnsName: mdns?.name ?? null,
      mdnsModel: mdns?.model ?? null,
      mdnsServices: mdns?.services ?? [],
      ssdpName: ssdp?.name ?? null,
      ssdpModel: ssdp?.model ?? null,
      ssdpManufacturer: ssdp?.manufacturer ?? null,
      ssdpType: ssdp?.deviceType ?? null
    })

    const previous = (mac ? customByMac.get(mac) : undefined) ?? knownByIp.get(ip)
    const isAlive = ip === iface.ip || aliveByIp.has(ip) || !!arpEntry
    const hostLabel = classification.displayName ?? netbios ?? reverse ?? mdns?.name ?? ssdp?.name ?? null

    const device: Device = {
      id: mac ?? ip,
      ip,
      mac,
      vendor,
      hostname: hostLabel,
      customName: previous?.customName ?? null,
      type: classification.type,
      confidence: classification.confidence,
      evidence: classification.evidence,
      ports,
      services: classification.services,
      model: classification.model ?? ssdp?.model ?? mdns?.model ?? null,
      online: isAlive,
      isGateway: ip === gateway,
      isSelf: ip === iface.ip,
      firstSeen: previous?.firstSeen ?? now,
      lastSeen: isAlive ? now : previous?.lastSeen ?? now,
      latencyMs: aliveByIp.get(ip)?.latency ?? null,
      ignored: previous?.ignored ?? false,
      traffic: { up: 0, down: 0 }
    }

    if (previous && previous.type !== 'unknown' && device.type === 'unknown') {
      device.type = previous.type as DeviceType
      device.confidence = previous.confidence
    }

    devices.push(device)
  }

  // 路由器客户端列表包含休眠中不响应探测的设备，是局域网发现的权威来源
  for (const client of routerOutcome?.clients ?? []) {
    const existing =
      devices.find((item) => item.mac === client.mac) ??
      devices.find((item) => item.ip === client.ip)
    if (existing) {
      if (existing.mac === client.mac) existing.ip = client.ip
      if (client.online) {
        existing.online = true
        existing.lastSeen = now
      }
      if (!existing.hostname && client.hostname) existing.hostname = client.hostname
      if (!existing.evidence.some((item) => item.kind === 'router' && item.label === '路由器客户端列表')) {
        existing.evidence.push({ kind: 'router', label: '路由器客户端列表' })
      }
      continue
    }
    const vendor = lookupVendor(client.mac)
    const classification = classifyDevice({
      isGateway: client.ip === gateway,
      isSelf: client.ip === iface.ip,
      hostname: client.hostname,
      netbios: null,
      vendor,
      ports: [],
      mdnsName: null,
      mdnsModel: null,
      mdnsServices: [],
      ssdpName: null,
      ssdpModel: null,
      ssdpManufacturer: null,
      ssdpType: null
    })
    const previous = customByMac.get(client.mac)
    devices.push({
      id: client.mac,
      ip: client.ip,
      mac: client.mac,
      vendor,
      hostname: client.hostname ?? classification.displayName,
      customName: previous?.customName ?? null,
      type: classification.type,
      confidence: Math.max(classification.confidence, 0.5),
      evidence: [...classification.evidence, { kind: 'router', label: '路由器客户端列表' }],
      ports: [],
      services: classification.services,
      model: classification.model,
      online: client.online,
      isGateway: client.ip === gateway,
      isSelf: client.ip === iface.ip,
      firstSeen: previous?.firstSeen ?? now,
      lastSeen: client.online ? now : previous?.lastSeen ?? now,
      latencyMs: null,
      ignored: previous?.ignored ?? false,
      traffic: { up: 0, down: 0 }
    })
  }

  const events: TimelineEvent[] = []
  for (const device of devices) {
    const previous = (device.mac ? customByMac.get(device.mac) : undefined) ?? knownByIp.get(device.ip)
    if (!previous) {
      events.push({
        id: `new-${device.id}-${now}`,
        at: now,
        kind: 'new-device',
        title: `${device.customName || device.hostname || device.ip} 首次接入网络`,
        detail: device.vendor ? `${device.vendor} · ${device.ip}` : device.ip,
        deviceId: device.id
      })
    } else if (!previous.online && device.online) {
      events.push({
        id: `online-${device.id}-${now}`,
        at: now,
        kind: 'device-online',
        title: `${device.customName || device.hostname || device.ip} 上线`,
        detail: device.ip,
        deviceId: device.id
      })
    }
  }

  const discoveredIds = new Set(devices.map((d) => d.mac ?? d.ip))
  for (const previous of options.known) {
    if (previous.ignored) continue
    if (discoveredIds.has(previous.mac ?? previous.ip)) continue
    if (!previous.online) continue
    events.push({
      id: `offline-${previous.id}-${now}`,
      at: now,
      kind: 'device-offline',
      title: `${previous.customName || previous.hostname || previous.ip} 离线`,
      detail: previous.ip,
      deviceId: previous.id
    })
  }

  const offline = options.known
    .filter((item) => !discoveredIds.has(item.mac ?? item.ip))
    .map((item) => ({ ...item, online: false }))

  const allDevices = [...devices, ...offline].sort((a, b) => {
    if (a.online !== b.online) return a.online ? -1 : 1
    if (a.isGateway !== b.isGateway) return a.isGateway ? -1 : 1
    return ipToInt(a.ip) - ipToInt(b.ip)
  })

  emit({ phase: 'done', done: 1, total: 1, message: '扫描完成' })

  return {
    network: {
      hostname,
      platform: process.platform,
      interfaces,
      active: iface,
      wan,
      router: router ?? null,
      ipv6,
      scannedAt: Date.now(),
      deviceCount: devices.filter((d) => d.online).length
    },
    devices: allDevices,
    events: events.sort((a, b) => b.at - a.at).slice(0, 80),
    routerClients: routerOutcome
      ? { count: routerOutcome.clients.length, error: routerOutcome.error, at: Date.now() }
      : null,
    routerDetection,
    cancelled: false
  }
}
