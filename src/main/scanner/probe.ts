import dgram from 'node:dgram'
import net from 'node:net'
import http from 'node:http'
import https from 'node:https'
import type { PortInfo } from '@shared/types'
import { run } from './exec'
import { pool } from './net'

export const COMMON_PORTS: Array<{ port: number; service: string }> = [
  { port: 62078, service: 'ios-lockdown' },
  { port: 445, service: 'smb' },
  { port: 139, service: 'netbios-ssn' },
  { port: 135, service: 'msrpc' },
  { port: 3389, service: 'rdp' },
  { port: 22, service: 'ssh' },
  { port: 80, service: 'http' },
  { port: 443, service: 'https' },
  { port: 8080, service: 'http-alt' },
  { port: 8443, service: 'https-alt' },
  { port: 53, service: 'dns' },
  { port: 9100, service: 'printer' },
  { port: 631, service: 'ipp' },
  { port: 515, service: 'printer' },
  { port: 554, service: 'rtsp' },
  { port: 8554, service: 'rtsp' },
  { port: 1935, service: 'rtmp' },
  { port: 8008, service: 'googlecast' },
  { port: 8009, service: 'googlecast' },
  { port: 7000, service: 'airplay' },
  { port: 5000, service: 'nas' },
  { port: 5001, service: 'nas' },
  { port: 32400, service: 'plex' },
  { port: 1883, service: 'mqtt' },
  { port: 23, service: 'telnet' },
  { port: 8081, service: 'http-alt' },
  { port: 8888, service: 'http-alt' },
  { port: 49152, service: 'upnp' },
  { port: 3306, service: 'mysql' },
  { port: 5555, service: 'adb' }
]

export const FAST_PORTS = [80, 443, 22, 445, 62078, 8080, 3389, 53, 8009, 9100, 5000, 554]

export type ProbeOutcome = 'open' | 'refused' | 'none'

export function tcpReach(ip: string, port: number, timeoutMs = 600): Promise<ProbeOutcome> {
  return new Promise((resolve) => {
    const socket = new net.Socket()
    let settled = false
    const finish = (result: ProbeOutcome): void => {
      if (settled) return
      settled = true
      socket.destroy()
      resolve(result)
    }
    socket.setTimeout(timeoutMs)
    socket.once('connect', () => finish('open'))
    socket.once('timeout', () => finish('none'))
    socket.once('error', (error) => {
      const code = (error as NodeJS.ErrnoException).code
      finish(code === 'ECONNREFUSED' || code === 'ECONNRESET' ? 'refused' : 'none')
    })
    socket.connect(port, ip)
  })
}

export function tcpProbe(ip: string, port: number, timeoutMs = 600): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket()
    let settled = false
    const finish = (result: boolean): void => {
      if (settled) return
      settled = true
      socket.destroy()
      resolve(result)
    }
    socket.setTimeout(timeoutMs)
    socket.once('connect', () => finish(true))
    socket.once('timeout', () => finish(false))
    socket.once('error', () => finish(false))
    socket.connect(port, ip)
  })
}

export async function pingHost(ip: string, timeoutMs = 420): Promise<number | null> {
  const out = await run('ping', ['-n', '1', '-w', String(timeoutMs), '-4', ip], timeoutMs + 1500)
  if (!/TTL[=:]\s*\d+/i.test(out)) return null
  const match = out.match(/(?:time|时间)[=<]\s*(\d+)\s*ms/i)
  if (match) return Number(match[1])
  if (/(?:time|时间)\s*<\s*1\s*ms/i.test(out)) return 0.5
  return null
}

export async function discoverHost(ip: string): Promise<{ alive: boolean; latency: number | null }> {
  const outcomes = await pool(FAST_PORTS, FAST_PORTS.length, (port) => tcpReach(ip, port, 500))
  if (outcomes.includes('open')) return { alive: true, latency: null }
  // 端口拒绝（RST）同样证明主机在线，只是没开这些端口
  if (outcomes.includes('refused')) return { alive: true, latency: null }
  const latency = await pingHost(ip)
  return { alive: latency !== null, latency }
}

// 向每个地址发一个空 UDP 包：存活主机会回 ICMP，顺便刷新本机邻居缓存
export async function touchNeighbors(ips: string[]): Promise<void> {
  await pool(ips, 48, (ip) =>
    new Promise<void>((resolve) => {
      let socket: dgram.Socket
      try {
        socket = dgram.createSocket('udp4')
      } catch {
        resolve()
        return
      }
      const done = (): void => {
        try {
          socket.close()
        } catch {
          /* ignore */
        }
        resolve()
      }
      socket.once('error', done)
      socket.send(Buffer.from([0]), 9, ip, () => done())
    })
  )
}

export async function scanPorts(ip: string, ports = COMMON_PORTS): Promise<PortInfo[]> {
  const results = await pool(ports, 10, async (item) => {
    const open = await tcpProbe(ip, item.port, 550)
    return open ? item : null
  })
  return results.filter((item): item is PortInfo => item !== null).sort((a, b) => a.port - b.port)
}

export function httpGet(
  url: string,
  timeoutMs = 1500
): Promise<{ status: number; headers: Record<string, string>; body: string } | null> {
  return new Promise((resolve) => {
    let target: URL
    try {
      target = new URL(url)
    } catch {
      resolve(null)
      return
    }
    const client = target.protocol === 'https:' ? https : http
    const request = client.get(
      target,
      {
        timeout: timeoutMs,
        rejectUnauthorized: false,
        headers: { 'User-Agent': 'NekoNet/0.1', Accept: '*/*' }
      },
      (response: http.IncomingMessage) => {
        let body = ''
        response.setEncoding('utf8')
        response.on('data', (chunk: string) => {
          if (body.length < 200_000) body += chunk
        })
        response.on('end', () => {
          resolve({
            status: response.statusCode ?? 0,
            headers: Object.fromEntries(
              Object.entries(response.headers).map(([k, v]) => [k.toLowerCase(), Array.isArray(v) ? v.join(',') : String(v ?? '')])
            ),
            body
          })
        })
      }
    )
    request.on('timeout', () => request.destroy())
    request.on('error', () => resolve(null))
  })
}
