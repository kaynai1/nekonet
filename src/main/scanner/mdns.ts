import mDNS from 'multicast-dns'

export interface MdnsEntry {
  ip: string
  name: string | null
  services: string[]
  model: string | null
  port: number | null
}

const QUERY_SERVICES = [
  '_services._dns-sd._udp.local',
  '_http._tcp.local',
  '_googlecast._tcp.local',
  '_airplay._tcp.local',
  '_raop._tcp.local',
  '_ipp._tcp.local',
  '_printer._tcp.local',
  '_hap._tcp.local',
  '_matter._tcp.local',
  '_sonos._tcp.local',
  '_spotify-connect._tcp.local',
  '_smb._tcp.local',
  '_workstation._tcp.local',
  '_device-info._tcp.local',
  '_androidtvremote2._tcp.local',
  '_amzn-wplay._tcp.local',
  '_companion-link._tcp.local',
  '_sleep-proxy._udp.local'
]

const SERVICE_MAP: Record<string, string> = {
  '_googlecast': 'googlecast',
  '_airplay': 'airplay',
  '_raop': 'raop',
  '_ipp': 'ipp',
  '_printer': 'printer',
  '_hap': 'hap',
  '_matter': 'matter',
  '_sonos': 'sonos',
  '_spotify-connect': 'spotify-connect',
  '_smb': 'smb',
  '_workstation': 'workstation',
  '_device-info': 'device-info',
  '_androidtvremote2': 'androidtvremote',
  '_amzn-wplay': 'amzn-wplay',
  '_companion-link': 'companion-link',
  '_http': 'http',
  '_sleep-proxy': 'sleep-proxy',
  '_services': 'services'
}

interface SrvRecord {
  target: string
  port: number
}

interface InstanceInfo {
  instance: string
  service: string
  srv: SrvRecord | null
  txt: Record<string, string>
}

function cleanName(name: string): string {
  return name.replace(/\\032/g, ' ').replace(/\.$/, '')
}

function splitInstance(full: string): { label: string; service: string } {
  const clean = cleanName(full)
  const index = clean.indexOf('._')
  if (index === -1) return { label: clean.replace(/\.local$/i, ''), service: '' }
  return {
    label: clean.slice(0, index),
    service: clean.slice(index + 1).replace(/\.local$/i, '')
  }
}

function serviceId(service: string): string {
  const key = service.split('.').slice(0, 2).join('.')
  return SERVICE_MAP[key] ?? key.replace(/^_/, '')
}

export function startMdnsScan(interfaceIp: string | null, durationMs = 5000): Promise<MdnsEntry[]> {
  return new Promise((resolve) => {
    const aRecords = new Map<string, string>()
    const instances = new Map<string, InstanceInfo>()
    let finished = false

    let instance: ReturnType<typeof mDNS>
    try {
      instance = mDNS({ interface: interfaceIp ?? undefined, loopback: true })
    } catch {
      resolve([])
      return
    }

    const ask = (): void => {
      try {
        instance.query(QUERY_SERVICES.map((name) => ({ name, type: 'PTR' })))
        instance.query([{ name: 'local', type: 'PTR' }])
      } catch {
        /* ignore */
      }
    }

    instance.on('response', (response) => {
      const packets = [...(response.answers ?? []), ...(response.additionals ?? [])]
      for (const record of packets) {
        const name = cleanName(String(record.name))
        if (record.type === 'A') {
          aRecords.set(name, String(record.data))
          continue
        }
        if (record.type === 'PTR') {
          const target = cleanName(String(record.data))
          if (!target.includes('._')) continue
          if (!instances.has(target)) {
            const parts = splitInstance(target)
            instances.set(target, {
              instance: target,
              service: parts.service,
              srv: null,
              txt: {}
            })
          }
          continue
        }
        if (record.type === 'SRV') {
          const data = record.data as unknown as { target?: string; port?: number }
          if (!instances.has(name)) {
            const parts = splitInstance(name)
            instances.set(name, { instance: name, service: parts.service, srv: null, txt: {} })
          }
          const entry = instances.get(name)!
          entry.srv = { target: cleanName(String(data.target ?? '')), port: Number(data.port ?? 0) }
          continue
        }
        if (record.type === 'TXT') {
          const raw = record.data as unknown
          const chunks = ([] as Buffer[]).concat(raw as Buffer[])
          const txt: Record<string, string> = {}
          for (const chunk of chunks) {
            if (!Buffer.isBuffer(chunk)) continue
            const text = chunk.toString('utf8')
            const eq = text.indexOf('=')
            if (eq > 0) txt[text.slice(0, eq).toLowerCase()] = text.slice(eq + 1)
          }
          if (!instances.has(name)) {
            const parts = splitInstance(name)
            instances.set(name, { instance: name, service: parts.service, srv: null, txt: {} })
          }
          instances.get(name)!.txt = { ...instances.get(name)!.txt, ...txt }
        }
      }
    })

    instance.on('error', () => {
      /* ignore socket errors */
    })

    ask()
    const timers = [setTimeout(ask, 1200), setTimeout(ask, 2600)]
    const unresolved = setTimeout(() => {
      const targets = [...instances.values()]
        .map((i) => i.srv?.target)
        .filter((t): t is string => !!t && !aRecords.has(t))
      if (targets.length) {
        try {
          instance.query(targets.map((name) => ({ name, type: 'A' })))
        } catch {
          /* ignore */
        }
      }
    }, 3000)

    setTimeout(() => {
      if (finished) return
      finished = true
      timers.forEach(clearTimeout)
      clearTimeout(unresolved)
      const byIp = new Map<string, MdnsEntry>()
      for (const info of instances.values()) {
        const target = info.srv?.target
        const ip = (target && aRecords.get(target)) || aRecords.get(cleanName(info.instance))
        if (!ip) continue
        const label = splitInstance(info.instance).label.replace(/^_+/, '')
        const txt = info.txt
        const displayName = (txt.fn || txt.ty || label || '').trim() || null
        const model = txt.model || txt.md || txt.am || null
        const service = serviceId(info.service)
        const existing = byIp.get(ip)
        if (existing) {
          if (service && !existing.services.includes(service)) existing.services.push(service)
          if (!existing.name && displayName) existing.name = displayName
          if (!existing.model && model) existing.model = model
          if (!existing.port && info.srv?.port) existing.port = info.srv.port
        } else {
          byIp.set(ip, {
            ip,
            name: displayName,
            services: service ? [service] : [],
            model,
            port: info.srv?.port ?? null
          })
        }
      }
      try {
        instance.destroy()
      } catch {
        /* ignore */
      }
      resolve([...byIp.values()])
    }, durationMs)
  })
}
