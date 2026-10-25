import type { DeviceType, Evidence, PortInfo } from '@shared/types'
import { vendorTypeHint } from './oui'

export interface ClassificationInput {
  isGateway: boolean
  isSelf: boolean
  hostname: string | null
  netbios: string | null
  vendor: string | null
  ports: PortInfo[]
  mdnsName: string | null
  mdnsModel: string | null
  mdnsServices: string[]
  ssdpName: string | null
  ssdpModel: string | null
  ssdpManufacturer: string | null
  ssdpType: string | null
}

export interface Classification {
  type: DeviceType
  confidence: number
  model: string | null
  displayName: string | null
  evidence: Evidence[]
  services: string[]
}

type Scores = Partial<Record<DeviceType, number>>

const EMPTY: Scores = {}

function add(scores: Scores, type: DeviceType, value: number): void {
  scores[type] = (scores[type] ?? 0) + value
}

const PORT_RULES: Array<{
  ports: number[]
  scores: Scores
  label: string
}> = [
  { ports: [62078], scores: { phone: 0.82 }, label: '端口 62078（iOS 同步服务）' },
  { ports: [9100, 631, 515], scores: { printer: 0.85 }, label: '打印服务端口' },
  { ports: [554, 8554], scores: { camera: 0.72 }, label: '端口 554（RTSP 视频流）' },
  { ports: [8008, 8009], scores: { tv: 0.38 }, label: '端口 8008/8009（Cast）' },
  { ports: [32400], scores: { nas: 0.34 }, label: '端口 32400（Plex）' },
  { ports: [5000, 5001], scores: { nas: 0.52 }, label: '端口 5000/5001（NAS 管理）' },
  { ports: [1883], scores: { iot: 0.58 }, label: '端口 1883（MQTT）' },
  { ports: [445, 139], scores: { desktop: 0.34, laptop: 0.28 }, label: 'SMB 文件共享端口' },
  { ports: [3389], scores: { desktop: 0.24 }, label: '端口 3389（远程桌面）' },
  { ports: [22], scores: { nas: 0.16 }, label: '端口 22（SSH）' },
  { ports: [7000], scores: { tv: 0.26 }, label: '端口 7000（AirPlay）' }
]

const SERVICE_RULES: Array<{ services: string[]; scores: Scores; label: string }> = [
  { services: ['googlecast'], scores: { tv: 0.88 }, label: 'mDNS 广播 Google Cast' },
  { services: ['androidtvremote'], scores: { tv: 0.82 }, label: 'mDNS 广播 Android TV' },
  { services: ['sonos'], scores: { speaker: 0.92 }, label: 'mDNS 广播 Sonos' },
  { services: ['spotify-connect'], scores: { speaker: 0.78 }, label: 'mDNS 广播 Spotify Connect' },
  { services: ['raop'], scores: { speaker: 0.5 }, label: 'mDNS 广播 AirPlay 音频' },
  { services: ['airplay'], scores: { tv: 0.36, speaker: 0.24 }, label: 'mDNS 广播 AirPlay' },
  { services: ['ipp', 'printer'], scores: { printer: 0.45 }, label: 'mDNS 广播打印服务' },
  { services: ['hap', 'matter'], scores: { iot: 0.68 }, label: 'mDNS 广播智能家居协议' },
  { services: ['amzn-wplay'], scores: { tv: 0.5 }, label: 'mDNS 广播 Amazon 投屏' },
  { services: ['smb', 'workstation'], scores: { desktop: 0.26, nas: 0.14 }, label: 'mDNS 广播文件共享' },
  { services: ['companion-link'], scores: { phone: 0.3 }, label: 'mDNS 广播 Apple 设备互连' }
]

const SSDP_RULES: Array<{ re: RegExp; scores: Scores; label: string }> = [
  { re: /internetgatewaydevice/i, scores: { router: 0.9 }, label: 'SSDP 网关设备' },
  { re: /mediarenderer/i, scores: { tv: 0.4, speaker: 0.3 }, label: 'SSDP 媒体渲染器' },
  { re: /mediaserver/i, scores: { nas: 0.52 }, label: 'SSDP 媒体服务器' },
  { re: /basic:1/i, scores: { iot: 0.28 }, label: 'SSDP 基础智能设备' }
]

const HOST_RULES: Array<{ re: RegExp; scores: Scores; label: string }> = [
  { re: /ipad/, scores: { tablet: 0.86 }, label: '主机名包含 iPad' },
  { re: /iphone|ipod/, scores: { phone: 0.84 }, label: '主机名包含 iPhone' },
  { re: /macbook/, scores: { laptop: 0.82 }, label: '主机名包含 MacBook' },
  { re: /imac|mac-?mini|mac-?pro|mac-?studio/, scores: { desktop: 0.78 }, label: '主机名包含 Mac' },
  { re: /android/, scores: { phone: 0.52 }, label: '主机名包含 Android' },
  { re: /galaxy|pixel|redmi|oneplus|honor|huawei-?p/, scores: { phone: 0.34 }, label: '主机名匹配机型' },
  { re: /laptop|notebook|thinkpad|ideapad|book-?pro/, scores: { laptop: 0.72 }, label: '主机名包含笔记本关键字' },
  { re: /desktop|workstation|-pc\b|^pc-|win-/, scores: { desktop: 0.5 }, label: '主机名包含台式机关键字' },
  { re: /appletv|bravia|webos|tizen|firetv|shield|roku|chromecast|smart-?tv|\btv\b/, scores: { tv: 0.72 }, label: '主机名包含电视关键字' },
  { re: /printer|epson|canon|brother|hp-?print/, scores: { printer: 0.62 }, label: '主机名包含打印机关键字' },
  { re: /diskstation|synology|qnap|truenas|openmediavault|\bnas\b/, scores: { nas: 0.74 }, label: '主机名包含 NAS 关键字' },
  { re: /camera|\bipc\b|doorbell|cam-|-cam/, scores: { camera: 0.6 }, label: '主机名包含摄像头关键字' },
  { re: /esp-|esp32|tasmota|shelly|tuya|sonoff/, scores: { iot: 0.72 }, label: '主机名匹配智能模组' },
  { re: /xbox|playstation|\bps[45]\b|nintendo|switch/, scores: { console: 0.86 }, label: '主机名匹配游戏主机' },
  { re: /echo|alexa|homepod|sonos|speaker|soundbar/, scores: { speaker: 0.7 }, label: '主机名匹配音箱关键字' },
  { re: /watch/, scores: { watch: 0.7 }, label: '主机名包含 watch' },
  { re: /router|gateway|openwrt|routeros|miwifi|asus-?rt/, scores: { router: 0.6 }, label: '主机名匹配路由器关键字' }
]

const MODEL_RULES: Array<{ re: RegExp; scores: Scores; label: string }> = [
  { re: /^iphone/i, scores: { phone: 0.8 }, label: '型号标识为 iPhone' },
  { re: /^ipad/i, scores: { tablet: 0.82 }, label: '型号标识为 iPad' },
  { re: /^macbook/i, scores: { laptop: 0.82 }, label: '型号标识为 MacBook' },
  { re: /^imac|^macmini|^macpro|^macstudio/i, scores: { desktop: 0.78 }, label: '型号标识为 Mac 台式机' },
  { re: /^appletv/i, scores: { tv: 0.88 }, label: '型号标识为 Apple TV' },
  { re: /^audioaccessory/i, scores: { speaker: 0.86 }, label: '型号标识为 HomePod' },
  { re: /^watch/i, scores: { watch: 0.85 }, label: '型号标识为 Apple Watch' }
]

function textOf(input: ClassificationInput): string {
  return [input.hostname, input.netbios, input.mdnsName, input.ssdpName]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

export function classifyDevice(input: ClassificationInput): Classification {
  const scores: Scores = {}
  const evidence: Evidence[] = []
  const services = new Set(input.mdnsServices)
  if (input.ssdpType || input.ssdpName) services.add('upnp')

  const push = (kind: Evidence['kind'], label: string): void => {
    if (!evidence.some((e) => e.label === label)) evidence.push({ kind, label })
  }

  if (input.isGateway) {
    add(scores, 'router', 1)
    push('router', '本机默认网关地址')
  }

  if (input.vendor) {
    const hint = vendorTypeHint(input.vendor)
    push('oui', `MAC 厂商：${input.vendor}`)
    if (hint) add(scores, hint.type, hint.weight)
  }

  for (const rule of PORT_RULES) {
    if (rule.ports.some((port) => input.ports.some((p) => p.port === port))) {
      for (const [type, value] of Object.entries(rule.scores)) add(scores, type as DeviceType, value)
      push('port', rule.label)
    }
  }

  for (const rule of SERVICE_RULES) {
    if (rule.services.some((s) => services.has(s))) {
      for (const [type, value] of Object.entries(rule.scores)) add(scores, type as DeviceType, value)
      push('mdns', rule.label)
    }
  }

  if (input.ssdpType) {
    for (const rule of SSDP_RULES) {
      if (rule.re.test(input.ssdpType)) {
        for (const [type, value] of Object.entries(rule.scores)) add(scores, type as DeviceType, value)
        push('ssdp', rule.label)
      }
    }
  }

  const text = textOf(input)
  if (text) {
    for (const rule of HOST_RULES) {
      if (rule.re.test(text)) {
        for (const [type, value] of Object.entries(rule.scores)) add(scores, type as DeviceType, value)
        push('hostname', rule.label)
      }
    }
  }

  const model = input.mdnsModel || input.ssdpModel
  if (model) {
    for (const rule of MODEL_RULES) {
      if (rule.re.test(model)) {
        for (const [type, value] of Object.entries(rule.scores)) add(scores, type as DeviceType, value)
        push('mdns', rule.label)
      }
    }
  }

  if (input.isSelf) add(scores, 'desktop', 0.2)

  let bestType: DeviceType = 'unknown'
  let bestScore = 0
  for (const [type, score] of Object.entries(scores) as Array<[DeviceType, number]>) {
    if (score > bestScore) {
      bestScore = score
      bestType = type
    }
  }

  const confidence = bestType === 'unknown' ? 0 : Math.min(0.97, Number(bestScore.toFixed(2)))
  const displayName =
    input.mdnsName ||
    input.ssdpName ||
    input.netbios ||
    input.hostname ||
    model ||
    null

  return {
    type: bestType,
    confidence,
    model: model ?? null,
    displayName,
    evidence,
    services: [...services]
  }
}

export function scoreToLabel(confidence: number): string {
  if (confidence >= 0.85) return '高置信'
  if (confidence >= 0.6) return '中置信'
  if (confidence > 0) return '推测'
  return '未识别'
}

export const EMPTY_SCORES = EMPTY
