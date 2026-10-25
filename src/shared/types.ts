export type DeviceType =
  | 'router'
  | 'phone'
  | 'tablet'
  | 'laptop'
  | 'desktop'
  | 'tv'
  | 'speaker'
  | 'camera'
  | 'printer'
  | 'nas'
  | 'console'
  | 'watch'
  | 'iot'
  | 'unknown'

export type EvidenceKind =
  | 'oui'
  | 'mdns'
  | 'ssdp'
  | 'netbios'
  | 'port'
  | 'hostname'
  | 'router'
  | 'user'

export interface Evidence {
  kind: EvidenceKind
  label: string
}

export interface PortInfo {
  port: number
  service: string
}

export interface Device {
  id: string
  ip: string
  mac: string | null
  vendor: string | null
  hostname: string | null
  customName: string | null
  type: DeviceType
  confidence: number
  evidence: Evidence[]
  ports: PortInfo[]
  services: string[]
  model: string | null
  online: boolean
  isGateway: boolean
  isSelf: boolean
  firstSeen: number
  lastSeen: number
  latencyMs: number | null
  ignored: boolean
  traffic: { up: number; down: number }
}

export interface WifiInfo {
  ssid: string | null
  bssid: string | null
  signalPct: number | null
  radioType: string | null
  band: string | null
  channel: number | null
  rxRateMbps: number | null
  txRateMbps: number | null
  auth: string | null
}

export interface InterfaceInfo {
  name: string
  description: string
  ip: string
  prefix: number
  netmask: string
  cidr: string
  mac: string | null
  gateway: string | null
  dns: string[]
  speed: string | null
  isWifi: boolean
  isDefault: boolean
  wifi: WifiInfo | null
  ipv6: string[]
  ipv6Gateway: string | null
}

export interface Ipv6Info {
  address: string | null
  prefix: number | null
  gateway: string | null
  addresses: string[]
}

export interface WanInfo {
  ip: string | null
  isp: string | null
  asn: string | null
  city: string | null
  region: string | null
  country: string | null
  source: string
}

export interface RouterInfo {
  ip: string
  name: string | null
  model: string | null
  manufacturer: string | null
  externalIp: string | null
  upnp: boolean
  latencyMs: number | null
  openPorts: number[]
}

export interface NetworkSnapshot {
  hostname: string
  platform: string
  interfaces: InterfaceInfo[]
  active: InterfaceInfo | null
  wan: WanInfo | null
  router: RouterInfo | null
  ipv6: Ipv6Info
  scannedAt: number
  deviceCount: number
}

export type ScanPhase =
  | 'idle'
  | 'interfaces'
  | 'sweep'
  | 'arp'
  | 'fingerprint'
  | 'mdns'
  | 'ssdp'
  | 'names'
  | 'router'
  | 'done'

export interface ScanProgress {
  phase: ScanPhase
  done: number
  total: number
  message: string
}

export interface TimelineEvent {
  id: string
  at: number
  kind: 'new-device' | 'device-online' | 'device-offline' | 'scan' | 'gateway'
  title: string
  detail: string | null
  deviceId: string | null
}

export interface GatewayConfig {
  enabled: boolean
  url: string
  secret: string
}

export interface GatewayStatus {
  connected: boolean
  version: string | null
  error: string | null
  up: number
  down: number
  memory: number | null
  node: string | null
  since: number | null
}

export interface TrafficSample {
  t: number
  up: number
  down: number
}

export interface TrafficBucket {
  key: string
  label: string
  up: number
  down: number
  count: number
}

export interface TrafficPayload {
  samples: TrafficSample[]
  minutes: TrafficSample[]
  devices: TrafficBucket[]
  domains: TrafficBucket[]
  totalUp: number
  totalDown: number
}

export interface CoreConfig {
  enabled: boolean
  subscriptionUrl: string
  systemProxy: boolean
}

export interface CoreStatus {
  running: boolean
  available: boolean
  version: string | null
  port: number
  error: string | null
  systemProxy: boolean
}

export type RouterBrand =
  | 'zte'
  | 'huawei'
  | 'fiberhome'
  | 'nokia'
  | 'tplink'
  | 'xiaomi'
  | 'h3c'
  | 'asus'
  | 'dlink'
  | 'unknown'

export type IspCode = 'cmcc' | 'ctcc' | 'cucc' | 'cbn'

export interface RouterDetection {
  at: number
  url: string
  reachable: boolean
  title: string | null
  brand: RouterBrand
  isp: IspCode | null
  supported: boolean
  note: string
  error: string | null
}

export interface RouterConfig {
  enabled: boolean
  url: string
  username: string
  password: string
}

export interface RouterClientsStatus {
  count: number
  error: string | null
  at: number
}

export interface RouterFlowRow {
  key: string
  label: string
  autoLabel: string
  detail: string | null
  kind: 'wired' | 'wifi'
  up: number
  down: number
  totalUp: number
  totalDown: number
}

export interface RouterTrafficStatus {
  connected: boolean
  error: string | null
  at: number | null
  up: number
  down: number
  totalUp: number
  totalDown: number
  rows: RouterFlowRow[]
}

export interface RouterTrafficHistory {
  samples: TrafficSample[]
  minutes: TrafficSample[]
}

export interface Settings {
  subnet: string | null
  intervalSec: number
  enableMdns: boolean
  enableSsdp: boolean
  enableNetbios: boolean
  enablePortScan: boolean
  notifications: boolean
  theme: 'dark' | 'light'
  onboarded: boolean
  gateway: GatewayConfig
  core: CoreConfig
  router: RouterConfig
  flowLabels: Record<string, string>
}

export type SettingsPatch = Omit<Partial<Settings>, 'gateway' | 'core' | 'router'> & {
  gateway?: Partial<GatewayConfig>
  core?: Partial<CoreConfig>
  router?: Partial<RouterConfig>
}

export interface AppStateSnapshot {
  scanning: boolean
  progress: ScanProgress
  network: NetworkSnapshot | null
  devices: Device[]
  events: TimelineEvent[]
  gateway: GatewayStatus
  core: CoreStatus
  traffic: TrafficPayload
  settings: Settings
  routerClients: RouterClientsStatus | null
  routerTraffic: RouterTrafficStatus | null
  routerDetection: RouterDetection | null
  routerHistory: RouterTrafficHistory
  lastScanAt: number | null
}

export interface ScanResult {
  network: NetworkSnapshot
  devices: Device[]
  events: TimelineEvent[]
}

export interface NekoApi {
  getState: () => Promise<AppStateSnapshot>
  scan: () => Promise<ScanResult | null>
  cancelScan: () => Promise<void>
  updateSettings: (patch: SettingsPatch) => Promise<Settings>
  renameDevice: (id: string, name: string) => Promise<Device[]>
  ignoreDevice: (id: string, ignored: boolean) => Promise<Device[]>
  testGateway: (config: GatewayConfig) => Promise<GatewayStatus>
  testRouter: (config: RouterConfig) => Promise<RouterClientsStatus>
  detectRouter: (url: string) => Promise<RouterDetection>
  reconnectGateway: () => Promise<void>
  wakeDevice: (ip: string) => Promise<boolean>
  exportData: () => Promise<string | null>
  openExternal: (url: string) => Promise<void>
  setTheme: (theme: 'dark' | 'light') => void
  onState: (cb: (state: AppStateSnapshot) => void) => () => void
}
