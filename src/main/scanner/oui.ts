import ouiData from 'oui-data'
import type { DeviceType } from '@shared/types'

const RAW = ouiData as Record<string, string>

const BRAND_ALIASES: Array<[RegExp, string]> = [
  [/^apple/i, 'Apple'],
  [/^samsung/i, 'Samsung'],
  [/^huawei/i, '华为'],
  [/^xiaomi|^beijing xiaomi/i, '小米'],
  [/^tp-?link/i, 'TP-Link'],
  [/^tenda/i, '腾达'],
  [/^mercury/i, '水星'],
  [/^zte/i, '中兴'],
  [/^hikvision/i, '海康威视'],
  [/^dahua/i, '大华'],
  [/^ezviz/i, '萤石'],
  [/^imou/i, '乐橙'],
  [/^espressif/i, 'Espressif'],
  [/^tuya/i, '涂鸦智能'],
  [/^raspberry pi/i, 'Raspberry Pi'],
  [/^sonos/i, 'Sonos'],
  [/^intel/i, 'Intel'],
  [/^realtek/i, 'Realtek'],
  [/^broadcom/i, 'Broadcom'],
  [/^qualcomm/i, 'Qualcomm'],
  [/^mediatek/i, 'MediaTek'],
  [/^sony/i, 'Sony'],
  [/^lg electronics|^lg innotek/i, 'LG'],
  [/^amazon/i, 'Amazon'],
  [/^google/i, 'Google'],
  [/^nest/i, 'Google Nest'],
  [/^roku/i, 'Roku'],
  [/^philips/i, 'Philips'],
  [/^signify/i, 'Philips Hue'],
  [/^nintendo/i, 'Nintendo'],
  [/^microsoft/i, 'Microsoft'],
  [/^dell/i, 'Dell'],
  [/^hewlett|^hp inc/i, 'HP'],
  [/^lenovo/i, 'Lenovo'],
  [/^asustek|^asus/i, 'ASUS'],
  [/^netgear/i, 'NETGEAR'],
  [/^ubiquiti/i, 'Ubiquiti'],
  [/^mikrotik/i, 'MikroTik'],
  [/^synology/i, 'Synology'],
  [/^qnap/i, 'QNAP'],
  [/^western digital/i, 'Western Digital'],
  [/^canon/i, 'Canon'],
  [/^epson/i, 'Epson'],
  [/^brother/i, 'Brother'],
  [/^xiaomi communications/i, '小米'],
  [/^oppo/i, 'OPPO'],
  [/^vivo/i, 'vivo'],
  [/^oneplus/i, 'OnePlus'],
  [/^honor/i, '荣耀'],
  [/^realme/i, 'realme'],
  [/^motorola/i, 'Motorola'],
  [/^nokia/i, 'Nokia'],
  [/^cisco/i, 'Cisco'],
  [/^aruba/i, 'Aruba'],
  [/^d-link/i, 'D-Link'],
  [/^sagemcom/i, 'Sagemcom'],
  [/^arcadyan/i, 'Arcadyan'],
  [/^sercomm/i, 'Sercomm'],
  [/^foxconn|^hon hai/i, 'Foxconn'],
  [/^liteon/i, 'Lite-On'],
  [/^azurewave/i, 'AzureWave'],
  [/^murata/i, 'Murata'],
  [/^texas instruments/i, 'TI'],
  [/^nxp/i, 'NXP'],
  [/^stmicro/i, 'ST'],
  [/^silicon labs/i, 'Silicon Labs'],
  [/^espress/i, 'Espressif'],
  [/^wistron/i, 'Wistron'],
  [/^compal/i, 'Compal'],
  [/^pegatron/i, 'Pegatron'],
  [/^quanta/i, 'Quanta'],
  [/^inventec/i, 'Inventec'],
  [/^juniper/i, 'Juniper'],
  [/^fortinet/i, 'Fortinet'],
  [/^hangzhou ezviz/i, '萤石'],
  [/^hangzhou hikvision/i, '海康威视'],
  [/^shenzhen hikvision/i, '海康威视'],
  [/^shenzhen bilian/i, '碧莲电子'],
  [/^beijing xiaomi/i, '小米']
]

const TYPE_HINTS: Array<[RegExp, DeviceType, number]> = [
  [/espressif|tuya|sonoff|shelly|itead|smart home|silicon labs|涂鸦/i, 'iot', 0.55],
  [/hikvision|dahua|ezviz|imou|axis|uniview|reolink|tp-link.*camera|海康威视|大华|萤石|乐橙/i, 'camera', 0.72],
  [/sonos|bose|harman|jbl|marshall|denon|yamaha/i, 'speaker', 0.6],
  [/canon|epson|brother|xerox|ricoh|lexmark|kyocera|佳能|爱普生|兄弟/i, 'printer', 0.75],
  [/synology|qnap|western digital|buffalo|drobo|群晖|威联通/i, 'nas', 0.7],
  [/raspberry pi/i, 'nas', 0.45],
  [/nintendo|sony interactive|sega|任天堂/i, 'console', 0.7],
  [/roku|vizio|tcl|hisense|skyworth|konka|changhong|海信|创维|长虹|康佳/i, 'tv', 0.6],
  [/google|nest/i, 'tv', 0.4],
  [/amazon/i, 'speaker', 0.4],
  [/tp-link|netgear|ubiquiti|mikrotik|d-link|tenda|mercury|sagemcom|arcadyan|sercomm|zyxel|linksys|普联|腾达|水星/i, 'router', 0.45],
  [/apple/i, 'phone', 0.32],
  [
    /samsung|xiaomi|oppo|vivo|oneplus|honor|realme|motorola|nokia|huawei|三星|小米|华为|荣耀|一加|真我|摩托罗拉|诺基亚/i,
    'phone',
    0.3
  ],
  [/intel|realtek|broadcom|qualcomm|mediatek|dell|lenovo|asustek|hp inc|hewlett|microsoft/i, 'laptop', 0.25]
]

const FRIENDLY_OVERRIDES: Record<string, string> = {
  'Shenzhen Bilian Electronic Co.,Ltd': '碧莲电子',
  'Beijing Xiaomi Electronics Co.,Ltd': '小米',
  'Xiaomi Communications Co Ltd': '小米',
  'HUAWEI TECHNOLOGIES CO.,LTD': '华为',
  'Espressif Inc.': 'Espressif',
  'Raspberry Pi Trading Ltd': 'Raspberry Pi',
  'TP-LINK TECHNOLOGIES CO.,LTD.': 'TP-Link',
  'Shenzhen Tenda Technology Co.,Ltd.': '腾达'
}

const cache = new Map<string, string | null>()

export function normalizeMac(mac: string): string {
  return mac.toUpperCase().replace(/[^0-9A-F]/g, '').slice(0, 12)
}

export function macKey(mac: string): string {
  const clean = normalizeMac(mac)
  return clean.slice(0, 6)
}

export function lookupVendor(mac: string | null): string | null {
  if (!mac) return null
  const key = macKey(mac)
  if (key.length !== 6) return null
  if (cache.has(key)) return cache.get(key) ?? null

  const raw = RAW[key]
  let vendor: string | null = null
  if (raw) {
    const firstLine = raw.split('\n')[0].trim()
    if (firstLine && firstLine.toLowerCase() !== 'private') {
      vendor = FRIENDLY_OVERRIDES[firstLine] ?? firstLine.replace(/,?\s*(Inc\.?|Ltd\.?|Co\.?,?\s*Ltd\.?|Corporation|Corp\.|LLC|GmbH|S\.A\.|SAS|B\.V\.|AG)$/i, '').trim()
      for (const [re, name] of BRAND_ALIASES) {
        if (re.test(firstLine)) {
          vendor = name
          break
        }
      }
    }
  }
  cache.set(key, vendor)
  return vendor
}

export function vendorTypeHint(vendor: string | null): { type: DeviceType; weight: number } | null {
  if (!vendor) return null
  for (const [re, type, weight] of TYPE_HINTS) {
    if (re.test(vendor)) return { type, weight }
  }
  return null
}
