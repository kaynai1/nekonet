import type { WanInfo } from '@shared/types'
import { isValidIp } from './net'

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

async function fetchWithTimeout(url: string, timeoutMs = 7000): Promise<Response | null> {
  try {
    return await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'application/json, text/plain, */*' },
      signal: AbortSignal.timeout(timeoutMs)
    })
  } catch {
    return null
  }
}

function splitOrg(org: string | null | undefined): { asn: string | null; isp: string | null } {
  if (!org) return { asn: null, isp: null }
  const match = org.match(/^(AS\d+)\s+(.*)$/i)
  if (match) return { asn: match[1].toUpperCase(), isp: match[2].trim() }
  return { asn: null, isp: org.trim() }
}

async function viaIpinfo(): Promise<WanInfo | null> {
  const response = await fetchWithTimeout('https://ipinfo.io/json')
  if (!response?.ok) return null
  const data = (await response.json()) as {
    ip?: string
    city?: string
    region?: string
    country?: string
    org?: string
  }
  if (!data.ip) return null
  const { asn, isp } = splitOrg(data.org)
  return {
    ip: data.ip,
    isp,
    asn,
    city: data.city ?? null,
    region: data.region ?? null,
    country: data.country ?? null,
    source: 'ipinfo.io'
  }
}

async function viaIpsb(): Promise<WanInfo | null> {
  const response = await fetchWithTimeout('https://api.ip.sb/geoip')
  if (!response?.ok) return null
  const data = (await response.json()) as Record<string, unknown>
  const ip = typeof data.ip === 'string' ? data.ip : null
  if (!ip) return null
  return {
    ip,
    isp: (data.isp as string) || (data.organization as string) || (data.asn_organization as string) || null,
    asn: data.asn ? `AS${data.asn}` : null,
    city: (data.city as string) ?? null,
    region: (data.region as string) ?? null,
    country: (data.country as string) ?? null,
    source: 'ip.sb'
  }
}

async function viaIpip(): Promise<WanInfo | null> {
  const response = await fetchWithTimeout('https://myip.ipip.net', 6000)
  if (!response?.ok) return null
  const text = await response.text()
  const ipMatch = text.match(/(\d{1,3}(?:\.\d{1,3}){3})/)
  if (!ipMatch || !isValidIp(ipMatch[1])) return null
  const where = text.match(/来自于[:：]\s*(.+)$/m)
  const parts = where ? where[1].trim().split(/\s+/) : []
  return {
    ip: ipMatch[1],
    isp: parts.slice(3).join(' ') || null,
    asn: null,
    city: parts[2] ?? null,
    region: parts[1] ?? null,
    country: parts[0] ?? null,
    source: 'ipip.net'
  }
}

let cache: { at: number; value: WanInfo | null } = { at: 0, value: null }

export async function fetchWanInfo(force = false): Promise<WanInfo | null> {
  if (!force && Date.now() - cache.at < 10 * 60_000) return cache.value
  for (const provider of [viaIpinfo, viaIpsb, viaIpip]) {
    try {
      const result = await provider()
      if (result?.ip) {
        cache = { at: Date.now(), value: result }
        return result
      }
    } catch {
      /* try next provider */
    }
  }
  cache = { at: Date.now(), value: null }
  return null
}
