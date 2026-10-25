import type { IspCode, RouterBrand, RouterDetection } from '@shared/types'

const TIMEOUT_MS = 5000
const CACHE_TTL = 5 * 60_000

interface BrandSignature {
  brand: RouterBrand
  patterns: RegExp[]
}

const BRANDS: BrandSignature[] = [
  {
    brand: 'zte',
    patterns: [/getpage\.gch/i, /Frm_Logintoken/i, /start\.ghtml/i, /\bZXHN\b/i, /\bZTE\b/i, /frmLogin/i, /logincode/i]
  },
  {
    brand: 'huawei',
    patterns: [/Huawei/i, /\bHG\d{4}\b/i, /\bHS\d{4}\b/i, /\bHN\d{4}\b/i, /\bEG\d{4}\b/i, /GetRandCount/i, /LoginTimes/i]
  },
  {
    brand: 'fiberhome',
    patterns: [/FiberHome/i, /烽火/i, /\bAN\d{4}\b/i, /\bHG2\d{3}\b/i]
  },
  {
    brand: 'nokia',
    patterns: [/Nokia/i, /Alcatel/i, /\bG-1[0-9]{3}/i]
  },
  {
    brand: 'tplink',
    patterns: [/TP-?Link/i, /tplogin/i, /普联/i]
  },
  {
    brand: 'xiaomi',
    patterns: [/Xiaomi/i, /miwifi/i, /小米/i]
  },
  {
    brand: 'h3c',
    patterns: [/\bH3C\b/i, /新华三/i, /H3CMagic/i]
  },
  {
    brand: 'asus',
    patterns: [/\bASUS\b/i, /asusrouter/i, /华硕/i]
  },
  {
    brand: 'dlink',
    patterns: [/D-?Link/i, /友讯/i]
  }
]

const ISP_TEXT: Array<[RegExp, IspCode]> = [
  [/中国移动|\bCMCC\b|China\s*Mobile/i, 'cmcc'],
  [/中国电信|China\s*Telecom|ChinaNet|天翼|\bCTCC\b/i, 'ctcc'],
  [/中国联通|China\s*Unicom|\bCUCC\b/i, 'cucc'],
  [/中国广电|China\s*Broadnet|\bCBN\b/i, 'cbn']
]

const ISP_SSID: Array<[RegExp, IspCode]> = [
  [/^CMCC/i, 'cmcc'],
  [/^ChinaNet/i, 'ctcc'],
  [/^ChinaUnicom|^CUCC/i, 'cucc'],
  [/^CBN/i, 'cbn']
]

const cache = new Map<string, { at: number; value: RouterDetection }>()

export function normalizeRouterUrl(url: string): string {
  let base = (url || '').trim()
  if (!base) base = 'http://192.168.1.1'
  if (!/^https?:\/\//i.test(base)) base = `http://${base}`
  return base.replace(/\/+$/, '')
}

function detectBrand(text: string): RouterBrand {
  let best: RouterBrand = 'unknown'
  let bestScore = 0
  for (const entry of BRANDS) {
    const score = entry.patterns.reduce((sum, pattern) => sum + (pattern.test(text) ? 1 : 0), 0)
    if (score > bestScore) {
      best = entry.brand
      bestScore = score
    }
  }
  return best
}

function detectIsp(text: string, ssid: string | null, wanIsp: string | null): IspCode | null {
  for (const [pattern, code] of ISP_TEXT) {
    if (pattern.test(text)) return code
  }
  if (ssid) {
    for (const [pattern, code] of ISP_SSID) {
      if (pattern.test(ssid)) return code
    }
  }
  if (wanIsp) {
    for (const [pattern, code] of ISP_TEXT) {
      if (pattern.test(wanIsp)) return code
    }
  }
  return null
}

function noteFor(brand: RouterBrand, reachable: boolean, url: string, error: string | null): string {
  if (!reachable) {
    return `无法访问 ${url}${error ? `（${error}）` : ''}，请确认管理地址与网络连接`
  }
  if (brand === 'zte') {
    return '已识别为中兴系光猫，可读取网口与 Wi-Fi 计数'
  }
  if (brand === 'unknown') {
    return '未识别出品牌，会按中兴固件尝试读取；若一直失败，请改用光猫后台查看'
  }
  return '当前仅适配中兴 H3-2s 固件，这台光猫的流量请用光猫后台查看；设备扫描不受影响'
}

export interface DetectHints {
  ssid?: string | null
  wanIsp?: string | null
}

export async function detectRouterBrand(
  url: string,
  hints: DetectHints = {},
  force = false
): Promise<RouterDetection> {
  const base = normalizeRouterUrl(url)
  const cached = cache.get(base)
  if (!force && cached && Date.now() - cached.at < CACHE_TTL) return cached.value

  const result: RouterDetection = {
    at: Date.now(),
    url: base,
    reachable: false,
    title: null,
    brand: 'unknown',
    isp: null,
    supported: false,
    note: '',
    error: null
  }

  let text = ''
  try {
    const res = await fetch(`${base}/`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,*/*;q=0.8'
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(TIMEOUT_MS)
    })
    text = (await res.text().catch(() => '')).slice(0, 200_000)
    result.reachable = res.status < 500
    result.title = text.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim().slice(0, 80) ?? null
    if (!result.reachable) result.error = `HTTP ${res.status}`
  } catch (error) {
    const err = error as Error & { cause?: { code?: string } }
    result.error = err.cause?.code === 'ECONNREFUSED' ? '连接被拒绝' : err.name === 'TimeoutError' ? '连接超时' : err.message.slice(0, 60)
  }

  if (result.reachable) {
    const fingerprint = [text, result.title ?? ''].join('\n')
    result.brand = detectBrand(fingerprint)
    result.isp = detectIsp(fingerprint, hints.ssid ?? null, hints.wanIsp ?? null)
    result.supported = result.brand === 'zte' || result.brand === 'unknown'
  }
  result.note = noteFor(result.brand, result.reachable, base, result.error)

  cache.set(base, { at: result.at, value: result })
  return result
}
