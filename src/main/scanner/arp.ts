import { isValidIp } from './net'
import { normalizeMac } from './oui'
import { run, runPowerShell } from './exec'

export interface ArpEntry {
  ip: string
  mac: string
  kind: 'dynamic' | 'static' | 'unknown'
}

const INVALID_MACS = new Set([
  '000000000000',
  'FFFFFFFFFFFF',
  '01005E000000'
])

function isUsable(mac: string): boolean {
  if (mac.length !== 12 || INVALID_MACS.has(mac)) return false
  if (mac.startsWith('01005E')) return false
  const first = parseInt(mac.slice(0, 2), 16)
  if (first & 0x01) return false
  return true
}

export async function readArpTable(): Promise<ArpEntry[]> {
  const out = await run('arp', ['-a'], 8000)
  const entries = new Map<string, ArpEntry>()

  for (const line of out.split(/\r?\n/)) {
    const match = line.match(
      /^\s*(\d{1,3}(?:\.\d{1,3}){3})\s+([0-9a-f]{2}(?:[-:][0-9a-f]{2}){5})\s*(.*)$/i
    )
    if (!match) continue
    const ip = match[1]
    if (!isValidIp(ip)) continue
    const mac = normalizeMac(match[2])
    if (!isUsable(mac)) continue
    const tail = match[3] || ''
    const kind = /static|静态/i.test(tail) ? 'static' : /dynamic|动态/i.test(tail) ? 'dynamic' : 'unknown'
    entries.set(ip, { ip, mac, kind })
  }

  if (entries.size === 0) {
    const psOut = await runPowerShell(
      "[Console]::OutputEncoding=[System.Text.Encoding]::UTF8;Get-NetNeighbor -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object { $_.LinkLayerAddress -and $_.LinkLayerAddress -ne '' } | Select-Object IPAddress,LinkLayerAddress,State | ConvertTo-Json -Compress",
      15000
    )
    try {
      const parsed = JSON.parse(psOut || '[]') as
        | { IPAddress: string; LinkLayerAddress: string; State: string }
        | Array<{ IPAddress: string; LinkLayerAddress: string; State: string }>
      const list = ([] as Array<{ IPAddress: string; LinkLayerAddress: string; State: string }>).concat(parsed)
      for (const item of list) {
        const mac = normalizeMac(item.LinkLayerAddress || '')
        if (!isValidIp(item.IPAddress) || !isUsable(mac)) continue
        entries.set(item.IPAddress, {
          ip: item.IPAddress,
          mac,
          kind: /reachable|permanent/i.test(item.State) ? 'dynamic' : 'unknown'
        })
      }
    } catch {
      /* ignore */
    }
  }

  return [...entries.values()]
}
