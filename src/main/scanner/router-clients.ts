import crypto from 'node:crypto'
import type { RouterConfig } from '@shared/types'
import { normalizeMac } from './oui'

export interface RouterClient {
  ip: string
  mac: string
  hostname: string | null
  port: string | null
  online: boolean
}

export interface RouterClientResult {
  clients: RouterClient[]
  error: string | null
}

export interface RouterPortCounter {
  name: string
  label: string
  linkUp: boolean
  speed: string
  upBytes: number
  downBytes: number
}

export interface RouterSsidCounter {
  index: string
  ssid: string
  upBytes: number
  downBytes: number
}

const TIMEOUT_MS = 6000
const KEEPALIVE_IDLE = 10_000
const CLIENT_CACHE_TTL = 45_000
const FAILURE_TTL = 5 * 60_000

// 中国移动 / 中兴代工网关（H3-2s 等）登录后的真实数据页
const DHCP_PAGE = 'getpage.gch?pid=1002&nextpage=status_ethlan_dhcp_info_t.gch'
const LAN_PAGE = 'getpage.gch?pid=1002&nextpage=gpon_status_lan_info_t.gch'
const WLAN_PAGE = 'getpage.gch?pid=1002&nextpage=e8_status_wlan_info_t.gch'
const KEEPALIVE_PAGE = 'start.ghtml'

const IP_RE = /\b(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\b/
const MAC_RE = /\b[0-9a-fA-F]{2}(?:[-:][0-9a-fA-F]{2}){5}\b/

function describeError(error: unknown): string {
  const err = error as Error & { cause?: { code?: string; message?: string } }
  const code = err.cause?.code
  if (code === 'ECONNREFUSED') return '连接被拒绝'
  if (code === 'ETIMEDOUT' || err.name === 'TimeoutError') return '连接超时'
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return '地址无法解析'
  return (err.cause?.message || err.message).slice(0, 80)
}

function normalizeBase(url: string): string {
  let base = (url || '').trim()
  if (!/^https?:\/\//i.test(base)) base = `http://${base}`
  return base.replace(/\/+$/, '')
}

function isLoginPage(text: string): boolean {
  return /name\s*=\s*["']?fLogin/i.test(text) || /id\s*=\s*["']?logincode/i.test(text)
}

// 网关未授权时返回 620/642 字节的跳转页；正常数据页都远大于 5KB
function isGatewayPage(text: string): boolean {
  if (text.length < 5000) return false
  if (/logout_redirect/i.test(text)) return false
  if (isLoginPage(text)) return false
  return true
}

function isPrivateIp(ip: string): boolean {
  return /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip) && ip !== '0.0.0.0'
}

function decodeEscapes(value: string): string {
  return value
    .replace(/\\x([0-9a-fA-F]{2})/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code: string) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&nbsp;|&amp;/g, ' ')
    .trim()
}

function cleanHostname(candidate: string | null | undefined): string | null {
  if (!candidate) return null
  const value = candidate.replace(/&nbsp;|&amp;/g, ' ').trim()
  if (!value || value.length > 40) return null
  if (/^(anonymous|unknown|-+|n\/a)$/i.test(value)) return null
  if (IP_RE.test(value) || MAC_RE.test(value)) return null
  if (!/[\p{L}\p{N}]/u.test(value)) return null
  return value
}

function cellText(html: string): string {
  return decodeEscapes(html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '))
}

function toNumber(value: string): number {
  const parsed = Number(value.replace(/[^\d]/g, ''))
  return Number.isFinite(parsed) ? parsed : 0
}

export function parseClients(html: string): RouterClient[] {
  const entries = new Map<string, Record<string, string>>()
  for (const match of html.matchAll(/Transfer_meaning\('([A-Za-z_]+?)(\d+)','([^']*)'\)/g)) {
    const [, name, index, raw] = match
    const bucket = entries.get(index) ?? {}
    bucket[name] = decodeEscapes(raw)
    entries.set(index, bucket)
  }

  const map = new Map<string, RouterClient>()
  for (const entry of entries.values()) {
    const ip = entry.IPAddr?.trim()
    const mac = entry.MACAddr?.trim()
    if (!ip || !mac || !ip.includes('.')) continue
    if (!IP_RE.test(ip) || !MAC_RE.test(mac)) continue
    if (/^00[:-]00[:-]00[:-]00[:-]00[:-]00$/.test(mac)) continue
    if (!isPrivateIp(ip) || ip === '127.0.0.1') continue
    const normalized = normalizeMac(mac)
    if (normalized.length !== 12) continue
    const port = entry.PhyPortName?.trim() || null
    const hostname = cleanHostname(entry.HostName || entry.hostname)
    const online = entry.Status ? entry.Status === '1' : true
    const existing = map.get(normalized)
    if (existing) {
      if (!existing.hostname && hostname) existing.hostname = hostname
      if (!existing.port && port) existing.port = port
      existing.online = existing.online || online
      continue
    }
    map.set(normalized, { ip, mac: normalized, hostname, port, online })
  }
  return [...map.values()]
}

export function parsePortCounters(html: string): RouterPortCounter[] {
  const ports: RouterPortCounter[] = []
  for (const row of html.match(/<tr\b[\s\S]*?<\/tr>/gi) ?? []) {
    const cells = (row.match(/<td\b[^>]*>[\s\S]*?<\/td>/gi) ?? []).map(cellText)
    if (cells.length < 7) continue
    const match = cells[0].match(/^网口(\d+)$/)
    if (!match) continue
    const index = match[1]
    ports.push({
      name: `LAN${index}`,
      label: cells[0],
      linkUp: cells[2].includes('已连接') && !cells[2].includes('未连接'),
      speed: cells[1],
      upBytes: toNumber(cells[3]),
      downBytes: toNumber(cells[5])
    })
  }
  return ports
}

export function parseSsidCounters(html: string): RouterSsidCounter[] {
  const ssids: RouterSsidCounter[] = []
  for (const row of html.match(/<tr\b[\s\S]*?<\/tr>/gi) ?? []) {
    const cells = (row.match(/<td\b[^>]*>[\s\S]*?<\/td>/gi) ?? []).map(cellText)
    if (cells.length !== 6) continue
    if (!/^\d{1,2}$/.test(cells[0])) continue
    if (!cells[1] || !/^\d+$/.test(cells[2]) || !/^\d+$/.test(cells[4])) continue
    ssids.push({
      index: cells[0],
      ssid: cells[1],
      upBytes: toNumber(cells[2]),
      downBytes: toNumber(cells[4])
    })
  }
  return ssids
}

class GatewaySession {
  private readonly base: string
  private readonly username: string
  private readonly password: string
  private lastOkAt = 0
  private authed = false
  private loginPromise: Promise<string | null> | null = null

  constructor(base: string, username: string, password: string) {
    this.base = base
    this.username = username
    this.password = password
  }

  private async request(path: string): Promise<{ status: number; text: string }> {
    const url = /^https?:\/\//i.test(path) ? path : `${this.base}/${path.replace(/^\//, '')}`
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
        // 网关对 Referer 做校验：根路径会被判定为未授权，必须伪装成从首页框架进入
        Referer: `${this.base}/start.ghtml`
      },
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS)
    })
    const text = await res.text().catch(() => '')
    return { status: res.status, text }
  }

  async login(): Promise<string | null> {
    let page: { status: number; text: string }
    try {
      page = await this.request('/')
    } catch (error) {
      return `无法连接路由器管理页面：${describeError(error)}`
    }
    if (!isLoginPage(page.text)) {
      this.authed = true
      this.lastOkAt = Date.now()
      return null
    }

    const body = new URLSearchParams({
      frashnum: '',
      action: 'login',
      Frm_Logintoken: '1',
      username: this.username,
      // 网关页面里的 md5.js 设置 hexcase=1，提交的是大写摘要
      logincode: crypto.createHash('md5').update(this.password).digest('hex').toUpperCase(),
      textpwd: crypto.createHash('md5').update('').digest('hex').toUpperCase(),
      ieversion: '1'
    })

    let result: { status: number; text: string }
    try {
      const res = await fetch(`${this.base}/`, {
        method: 'POST',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0 Safari/537.36',
          'Content-Type': 'application/x-www-form-urlencoded',
          Origin: this.base,
          Referer: `${this.base}/`
        },
        body: body.toString(),
        redirect: 'manual',
        signal: AbortSignal.timeout(TIMEOUT_MS)
      })
      result = { status: res.status, text: await res.text().catch(() => '') }
    } catch (error) {
      return `路由器登录请求失败：${describeError(error)}`
    }

    const redirected = result.status >= 300 && result.status < 400
    const rejected =
      isLoginPage(result.text) || /密码错误|账号或密码|登录失败|锁定|频繁|次数过多/.test(result.text)
    if (!redirected && rejected) return '路由器登录失败，请检查管理用户名与密码'
    if (!redirected && result.text.trim().length > 0 && !isLoginPage(result.text)) {
      // 部分固件登录成功也返回 200 + 空白页
      this.authed = true
      this.lastOkAt = Date.now()
      return null
    }
    if (!redirected) return '路由器登录失败，请检查管理用户名与密码'

    this.authed = true
    this.lastOkAt = Date.now()
    return null
  }

  private async ensureAuth(force = false): Promise<string | null> {
    if (this.authed && !force) return null
    if (!this.loginPromise) {
      this.loginPromise = this.login().finally(() => {
        this.loginPromise = null
      })
    }
    const error = await this.loginPromise
    if (error) this.authed = false
    return error
  }

  async get(path: string): Promise<string> {
    const authError = await this.ensureAuth(false)
    if (authError) throw new Error(authError)

    let page = await this.request(path)
    if (isGatewayPage(page.text)) {
      this.lastOkAt = Date.now()
      return page.text
    }

    this.authed = false
    const retryError = await this.ensureAuth(true)
    if (retryError) throw new Error(retryError)
    page = await this.request(path)
    if (!isGatewayPage(page.text)) throw new Error('网关登录成功，但数据页仍要求重新登录')
    this.lastOkAt = Date.now()
    return page.text
  }

  // 网关闲置约 30 秒即注销会话，靠轻量页面维持登录态
  async touchIfIdle(): Promise<void> {
    if (!this.authed || Date.now() - this.lastOkAt < KEEPALIVE_IDLE) return
    try {
      const page = await this.request(KEEPALIVE_PAGE)
      if (isGatewayPage(page.text)) {
        this.lastOkAt = Date.now()
      } else {
        this.authed = false
      }
    } catch {
      /* 下次数据请求会重新登录 */
    }
  }
}

interface SessionCache {
  key: string
  session: GatewaySession
}

let cachedSession: SessionCache | null = null
let cachedClients: { key: string; at: number; clients: RouterClient[] } | null = null
let lastFailure: { key: string; message: string; at: number; ttl: number } | null = null

function configKey(config: RouterConfig): string {
  return [
    normalizeBase(config.url || 'http://192.168.1.1'),
    config.username?.trim() || 'user',
    config.password ?? ''
  ].join('|')
}

function getSession(config: RouterConfig): GatewaySession {
  const key = configKey(config)
  if (!cachedSession || cachedSession.key !== key) {
    cachedSession = {
      key,
      session: new GatewaySession(
        normalizeBase(config.url || 'http://192.168.1.1'),
        config.username?.trim() || 'user',
        config.password ?? ''
      )
    }
    cachedClients = null
  }
  return cachedSession.session
}

export function resetGatewaySession(): void {
  cachedSession = null
  cachedClients = null
  lastFailure = null
}

export async function fetchRouterClients(config: RouterConfig): Promise<RouterClientResult> {
  const password = config.password ?? ''
  if (!password) return { clients: [], error: '未填写路由器管理密码' }

  const key = configKey(config)
  const now = Date.now()
  if (cachedClients && cachedClients.key === key && now - cachedClients.at < CLIENT_CACHE_TTL) {
    return { clients: cachedClients.clients, error: null }
  }
  if (lastFailure && lastFailure.key === key && now - lastFailure.at < lastFailure.ttl) {
    return { clients: [], error: lastFailure.message }
  }

  try {
    const html = await getSession(config).get(DHCP_PAGE)
    const clients = parseClients(html)
    cachedClients = { key, at: Date.now(), clients }
    lastFailure = null
    return { clients, error: null }
  } catch (error) {
    const message = (error as Error).message || '路由器客户端列表读取失败'
    const authFailure = /密码|登录失败/.test(message)
    lastFailure = {
      key,
      message,
      at: Date.now(),
      ttl: authFailure ? FAILURE_TTL : 30_000
    }
    return { clients: [], error: message }
  }
}

export interface RouterCounterResult {
  ports: RouterPortCounter[]
  ssids: RouterSsidCounter[]
}

export async function fetchRouterCounters(config: RouterConfig): Promise<RouterCounterResult> {
  if (!config.password) throw new Error('未填写路由器管理密码')
  const session = getSession(config)
  const lanHtml = await session.get(LAN_PAGE)
  const ports = parsePortCounters(lanHtml)
  let ssids: RouterSsidCounter[] = []
  try {
    const wlanHtml = await session.get(WLAN_PAGE)
    ssids = parseSsidCounters(wlanHtml)
  } catch {
    /* Wi-Fi 统计读取失败时保留网口数据 */
  }
  return { ports, ssids }
}

export async function touchRouterSession(config: RouterConfig): Promise<void> {
  if (!config.password || !cachedSession || cachedSession.key !== configKey(config)) return
  await cachedSession.session.touchIfIdle()
}
