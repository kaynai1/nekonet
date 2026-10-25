import os from 'node:os'
import type { InterfaceInfo, Ipv6Info, WifiInfo } from '@shared/types'
import { prefixToNetmask, pool } from './net'
import { run, runPowerShell } from './exec'

interface RawIface {
  name: string
  desc: string
  mac: string | null
  speed: string | null
  ip: string
  prefix: number
  gw: string | null
  dns: string[]
  v6?: string[] | string | null
  v6gw?: string | null
}

const IFACE_SCRIPT = [
  "[Console]::OutputEncoding=[System.Text.Encoding]::UTF8",
  "$ErrorActionPreference='SilentlyContinue'",
  "$def=(Get-NetRoute -DestinationPrefix '0.0.0.0/0' | Sort-Object -Property RouteMetric,ifMetric | Select-Object -First 1).InterfaceAlias",
  '$ifs=@(Get-NetIPConfiguration | Where-Object { $_.NetAdapter.Status -eq "Up" -and @($_.IPv4Address).Count -gt 0 } | ForEach-Object {',
  '  $ip=@($_.IPv4Address)[0]',
  '  $gw=@($_.IPv4DefaultGateway)[0]',
  '  $v6=@(Get-NetIPAddress -InterfaceIndex $_.InterfaceIndex -AddressFamily IPv6 -ErrorAction SilentlyContinue | Where-Object { $_.IPAddress -notlike "fe80*" -and $_.PrefixOrigin -ne "WellKnown" } | Select-Object -First 4 | ForEach-Object { $_.IPAddress })',
  '  $v6gw=[string](Get-NetRoute -InterfaceIndex $_.InterfaceIndex -DestinationPrefix "::/0" -ErrorAction SilentlyContinue | Sort-Object -Property RouteMetric,ifMetric | Select-Object -First 1).NextHop',
  '  [pscustomobject]@{',
  '    name=$_.InterfaceAlias',
  '    desc=$_.InterfaceDescription',
  '    mac=[string]$_.NetAdapter.MacAddress',
  '    speed=[string]$_.NetAdapter.LinkSpeed',
  '    ip=$ip.IPAddress',
  '    prefix=[int]$ip.PrefixLength',
  '    gw=$($gw.NextHop)',
  '    dns=@((Get-DnsClientServerAddress -InterfaceIndex $_.InterfaceIndex -AddressFamily IPv4).ServerAddresses | Where-Object { $_ -match "^\\d{1,3}(\\.\\d{1,3}){3}$" })',
  '    v6=$v6',
  '    v6gw=$v6gw',
  '  }',
  '})',
  '@{hostname=$env:COMPUTERNAME; default=$def; interfaces=$ifs} | ConvertTo-Json -Depth 6 -Compress'
].join('\n')

async function readInterfacesPowerShell(): Promise<{ hostname: string; def: string | null; list: RawIface[] } | null> {
  const out = await runPowerShell(IFACE_SCRIPT, 20000)
  if (!out.trim()) return null
  try {
    const parsed = JSON.parse(out) as {
      hostname?: string
      default?: string
      interfaces?: RawIface[] | RawIface
    }
    const list = parsed.interfaces ? ([] as RawIface[]).concat(parsed.interfaces) : []
    if (!list.length) return null
    return {
      hostname: parsed.hostname || os.hostname(),
      def: parsed.default || null,
      list: list.filter((i) => !!i.ip)
    }
  } catch {
    return null
  }
}

async function readGatewayFallback(): Promise<string | null> {
  const out = await run('route', ['print', '-4'])
  for (const line of out.split(/\r?\n/)) {
    const m = line.match(/^\s*0\.0\.0\.0\s+0\.0\.0\.0\s+(\d{1,3}(?:\.\d{1,3}){3})/)
    if (m) return m[1]
  }
  return null
}

async function readInterfacesFallback(): Promise<RawIface[]> {
  const gateway = await readGatewayFallback()
  const result: RawIface[] = []
  for (const [name, addresses] of Object.entries(os.networkInterfaces())) {
    if (!addresses) continue
    const ipv4 = addresses.find((a) => a.family === 'IPv4' && !a.internal)
    if (!ipv4) continue
    const v6 = addresses
      .filter((a) => a.family === 'IPv6' && !a.internal && !/^fe80:/i.test(a.address))
      .map((a) => a.address)
    result.push({
      name,
      desc: name,
      mac: ipv4.mac && ipv4.mac !== '00:00:00:00:00:00' ? ipv4.mac : null,
      speed: null,
      ip: ipv4.address,
      prefix: typeof ipv4.cidr === 'string' ? Number(ipv4.cidr.split('/')[1]) || 24 : 24,
      gw: gateway,
      dns: [],
      v6,
      v6gw: null
    })
  }
  return result
}

function parseWifi(text: string): WifiInfo | null {
  if (!/^\s*(?:SSID|BSSID)\s*:/im.test(text)) return null
  const pick = (re: RegExp): string | null => {
    const m = text.match(re)
    return m ? m[1].trim() : null
  }
  const num = (re: RegExp): number | null => {
    const m = text.match(re)
    if (!m) return null
    const value = Number(m[1])
    return Number.isFinite(value) ? value : null
  }
  const ssid = pick(/^\s*SSID\s*:\s*(.+)$/im)
  const bssid = pick(/^\s*BSSID\s*:\s*(.+)$/im)
  const signal = num(/^\s*(?:Signal|信号)\s*:\s*(\d{1,3})%/im)
  const radio = pick(/(?:Radio type|无线电类型)\s*:\s*(.+)$/im)
  const channel = num(/(?:Channel|信道)\s*:\s*(\d{1,4})/im)
  const rx = num(/(?:Receive rate|接收速率)[^:]*:\s*([\d.]+)/im)
  const tx = num(/(?:Transmit rate|传输速率)[^:]*:\s*([\d.]+)/im)
  const auth = pick(/(?:Authentication|身份验证)\s*:\s*(.+)$/im)
  let band: string | null = null
  if (channel !== null) {
    if (channel <= 14) band = '2.4 GHz'
    else if (channel <= 177) band = '5 GHz'
    else band = '6 GHz'
  }
  if (!ssid && signal === null) return null
  return {
    ssid: ssid ?? null,
    bssid: bssid ?? null,
    signalPct: signal,
    radioType: radio,
    band,
    channel,
    rxRateMbps: rx,
    txRateMbps: tx,
    auth
  }
}

async function readWifi(): Promise<WifiInfo | null> {
  const out = await run('netsh', ['wlan', 'show', 'interfaces'], 8000)
  return parseWifi(out)
}

const WIFI_HINT = /wi-?fi|wireless|wlan|802\.11|无线|wifi/i

function normalizeV6(value: RawIface['v6']): string[] {
  if (!value) return []
  const list = ([] as string[]).concat(value)
  return list
    .map((item) => String(item).trim())
    .filter((item) => item.includes(':') && !/^fe80:/i.test(item) && item !== '::1')
}

export async function collectInterfaces(): Promise<{
  hostname: string
  interfaces: InterfaceInfo[]
  active: InterfaceInfo | null
  ipv6: Ipv6Info
}> {
  const ps = await readInterfacesPowerShell()
  const raw = ps?.list ?? (await readInterfacesFallback())
  const hostname = ps?.hostname ?? os.hostname()
  const wifi = await readWifi()

  const interfaces: InterfaceInfo[] = raw.map((item) => {
    const isWifi = WIFI_HINT.test(`${item.name} ${item.desc}`)
    const isDefault = ps?.def ? item.name === ps.def : false
    const netmask = prefixToNetmask(Number.isFinite(item.prefix) ? item.prefix : 24)
    return {
      name: item.name,
      description: item.desc,
      ip: item.ip,
      prefix: Number.isFinite(item.prefix) ? item.prefix : 24,
      netmask,
      cidr: `${item.ip}/${Number.isFinite(item.prefix) ? item.prefix : 24}`,
      mac: item.mac && /^[0-9A-F:-]{11,17}$/i.test(item.mac) ? item.mac.toUpperCase() : null,
      gateway: item.gw ?? null,
      dns: Array.isArray(item.dns) ? item.dns : item.dns ? [item.dns as unknown as string] : [],
      speed: item.speed ?? null,
      isWifi,
      isDefault,
      wifi: isWifi ? wifi : null,
      ipv6: normalizeV6(item.v6),
      ipv6Gateway: item.v6gw && item.v6gw.includes(':') ? item.v6gw : null
    }
  })

  const byDefault = interfaces.find((i) => i.isDefault)
  const byWifi = interfaces.find((i) => i.isWifi && i.gateway)
  const byGateway = interfaces.find((i) => i.gateway)
  const active = byDefault ?? byWifi ?? byGateway ?? interfaces[0] ?? null

  const v6 = active?.ipv6 ?? []
  const ipv6: Ipv6Info = {
    address: v6[0] ?? null,
    prefix: null,
    gateway: active?.ipv6Gateway ?? null,
    addresses: v6
  }

  return { hostname, interfaces, active, ipv6 }
}
