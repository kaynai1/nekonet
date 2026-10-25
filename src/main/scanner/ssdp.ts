import dgram from 'node:dgram'
import { httpGet } from './probe'

export interface SsdpEntry {
  ip: string
  name: string | null
  model: string | null
  manufacturer: string | null
  deviceType: string | null
  server: string | null
  location: string | null
}

const SEARCH_TARGETS = [
  'ssdp:all',
  'urn:schemas-upnp-org:device:InternetGatewayDevice:1',
  'urn:schemas-upnp-org:device:MediaRenderer:1',
  'urn:schemas-upnp-org:device:MediaServer:1',
  'urn:schemas-upnp-org:device:Basic:1'
]

function buildSearch(target: string): Buffer {
  return Buffer.from(
    [
      'M-SEARCH * HTTP/1.1',
      'HOST: 239.255.255.250:1900',
      'MAN: "ssdp:discover"',
      'MX: 2',
      `ST: ${target}`,
      'USER-AGENT: Windows/10 UPnP/1.1 NekoNet/0.1',
      '',
      ''
    ].join('\r\n')
  )
}

function parseHeaders(raw: string): Record<string, string> {
  const headers: Record<string, string> = {}
  for (const line of raw.split(/\r?\n/).slice(1)) {
    const index = line.indexOf(':')
    if (index > 0) {
      headers[line.slice(0, index).trim().toLowerCase()] = line.slice(index + 1).trim()
    }
  }
  return headers
}

function tag(xml: string, name: string): string | null {
  const match = xml.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`, 'i'))
  if (!match) return null
  return match[1]
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, '')
    .trim()
}

export function scanSsdp(interfaceIp: string | null, durationMs = 3600): Promise<SsdpEntry[]> {
  return new Promise((resolve) => {
    const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true })
    const found = new Map<string, SsdpEntry>()
    let done = false

    const finish = async (): Promise<void> => {
      if (done) return
      done = true
      clearInterval(timer)
      try {
        socket.close()
      } catch {
        /* ignore */
      }

      const locations = [...new Set([...found.values()].map((f) => f.location).filter((l): l is string => !!l))].slice(0, 24)
      await Promise.all(
        locations.map(async (location) => {
          const response = await httpGet(location, 1600)
          if (!response || !response.body) return
          const body = response.body
          const friendly = tag(body, 'friendlyName')
          const model = tag(body, 'modelName') || tag(body, 'modelDescription')
          const manufacturer = tag(body, 'manufacturer')
          const deviceType = tag(body, 'deviceType')
          const target = [...found.values()].find((f) => f.location === location)
          if (!target) return
          if (friendly) target.name = friendly
          if (model) target.model = model
          if (manufacturer) target.manufacturer = manufacturer
          if (deviceType) target.deviceType = deviceType
        })
      )
      resolve([...found.values()])
    }

    socket.on('message', (msg, rinfo) => {
      const text = msg.toString('utf8', 0, Math.min(msg.length, 4000))
      if (!/^HTTP\/1\.[01]\s+200/i.test(text)) return
      const headers = parseHeaders(text)
      const existing = found.get(rinfo.address)
      const entry: SsdpEntry = existing ?? {
        ip: rinfo.address,
        name: null,
        model: null,
        manufacturer: null,
        deviceType: null,
        server: null,
        location: null
      }
      entry.server = headers.server ?? entry.server
      entry.location = headers.location ?? entry.location
      const st = headers.st ?? headers.nt ?? null
      if (st && (!entry.deviceType || /gateway|mediarenderer|mediaserver/i.test(st))) {
        entry.deviceType = st
      }
      found.set(rinfo.address, entry)
    })

    socket.on('error', () => {
      void finish()
    })

    socket.bind(0, interfaceIp ?? '0.0.0.0', () => {
      try {
        socket.setMulticastTTL(2)
        socket.setBroadcast(true)
      } catch {
        /* ignore */
      }
      const send = (): void => {
        for (const target of SEARCH_TARGETS) {
          socket.send(buildSearch(target), 1900, '239.255.255.250', () => undefined)
        }
      }
      send()
      setTimeout(send, 700)
      setTimeout(send, 1500)
    })

    const timer = setTimeout(() => {
      void finish()
    }, durationMs)
  })
}
