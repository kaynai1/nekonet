export const DEVICE_TYPE_LABEL: Record<string, string> = {
  router: '路由器',
  phone: '手机',
  tablet: '平板',
  laptop: '笔记本',
  desktop: '台式机',
  tv: '电视',
  speaker: '音箱',
  camera: '摄像头',
  printer: '打印机',
  nas: 'NAS',
  console: '游戏机',
  watch: '手表',
  iot: '智能设备',
  unknown: '未知设备'
}

export const SERVICE_LABEL: Record<string, string> = {
  'http': 'HTTP',
  'https': 'HTTPS',
  'ssh': 'SSH',
  'telnet': 'Telnet',
  'smb': 'SMB 文件共享',
  'netbios-ssn': 'NetBIOS',
  'msrpc': 'RPC',
  'rdp': '远程桌面',
  'dns': 'DNS',
  'ipp': 'IPP 打印',
  'printer': '打印服务',
  'rtsp': 'RTSP 视频流',
  'mqtt': 'MQTT',
  'upnp': 'UPnP',
  'airplay': 'AirPlay',
  'raop': 'AirPlay 音频',
  'googlecast': 'Google Cast',
  'spotify-connect': 'Spotify Connect',
  'hap': 'HomeKit',
  'matter': 'Matter',
  'plex': 'Plex',
  'synology': '群晖 DSM',
  'nas': 'NAS 管理',
  'ios-lockdown': 'iOS 同步',
  'http-alt': 'HTTP 备用'
}

export const EVIDENCE_LABEL: Record<string, string> = {
  oui: 'MAC 厂商',
  mdns: 'mDNS 广播',
  ssdp: 'SSDP 广播',
  netbios: 'NetBIOS',
  port: '端口指纹',
  hostname: '主机名',
  router: '网关',
  user: '手动标记'
}

export const PHASE_LABEL: Record<string, string> = {
  idle: '待机',
  interfaces: '读取网卡信息',
  sweep: '扫描网段',
  arp: '读取 ARP 表',
  fingerprint: '端口指纹识别',
  mdns: '监听 mDNS 广播',
  ssdp: '监听 SSDP 广播',
  names: '解析设备名称',
  router: '查询路由器',
  done: '完成'
}

export const ROUTER_BRAND_LABEL: Record<string, string> = {
  zte: '中兴 ZTE',
  huawei: '华为 Huawei',
  fiberhome: '烽火 FiberHome',
  nokia: '诺基亚 Nokia',
  tplink: 'TP-Link 普联',
  xiaomi: '小米 Xiaomi',
  h3c: '新华三 H3C',
  asus: '华硕 ASUS',
  dlink: 'D-Link 友讯',
  unknown: '未识别'
}

export const ISP_LABEL: Record<string, string> = {
  cmcc: '中国移动',
  ctcc: '中国电信',
  cucc: '中国联通',
  cbn: '中国广电'
}

const ISP_PATTERNS: Array<[RegExp, string]> = [
  [/中国移动|china\s*mobile|\bcmcc\b|chinamobile/i, '中国移动'],
  [/中国电信|china\s*telecom|chinanet|天翼|\bctcc\b/i, '中国电信'],
  [/中国联通|china\s*unicom|\bunicom\b|\bcucc\b/i, '中国联通'],
  [/中国广电|china\s*broadnet|\bcbn\b|广电/i, '中国广电']
]

// 公网 IP 库返回的运营商是英文，统一映射成国内习惯叫法
export function ispLabel(raw: string | null | undefined): string | null {
  if (!raw) return null
  for (const [pattern, label] of ISP_PATTERNS) {
    if (pattern.test(raw)) return label
  }
  return raw
}
