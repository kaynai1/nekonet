import dgram from 'node:dgram'
import http from 'node:http'
import https from 'node:https'

export interface UpnpDevice {
  ip: string
  friendlyName: string | null
  modelName: string | null
  manufacturer: string | null
  descriptionUrl: string | null
  controlUrl: string | null
  serviceType: string | null
  externalIp: string | null
}

interface HttpResponse {
  status: number
  body: string
}

function request(
  url: string,
  options: { method?: string; headers?: Record<string, string>; body?: string; timeout?: number } = {}
): Promise<HttpResponse | null> {
  return new Promise((resolve) => {
    let target: URL
    try {
      target = new URL(url)
    } catch {
      resolve(null)
      return
    }
    const client = target.protocol === 'https:' ? https : http
    const req = client.request(
      target,
      {
        method: options.method ?? 'GET',
        timeout: options.timeout ?? 2000,
        rejectUnauthorized: false,
        headers: {
          'User-Agent': 'Windows/10 UPnP/1.1 NekoNet/0.1',
          'Accept-Encoding': 'identity',
          Connection: 'close',
          ...(options.headers ?? {})
        }
      },
      (res) => {
        let body = ''
        res.setEncoding('utf8')
        res.on('data', (chunk: string) => {
          if (body.length < 120_000) body += chunk
        })
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body }))
      }
    )
    req.on('timeout', () => req.destroy())
    req.on('error', () => resolve(null))
    if (options.body) req.write(options.body)
    req.end()
  })
}

function discoverGatewayDescription(gatewayIp: string, timeoutMs = 2600): Promise<string | null> {
  return new Promise((resolve) => {
    const socket = dgram.createSocket('udp4')
    let location: string | null = null
    const message = Buffer.from(
      [
        'M-SEARCH * HTTP/1.1',
        'HOST: 239.255.255.250:1900',
        'MAN: "ssdp:discover"',
        'MX: 2',
        'ST: urn:schemas-upnp-org:device:InternetGatewayDevice:1',
        'USER-AGENT: Windows/10 UPnP/1.1 NekoNet/0.1',
        '',
        ''
      ].join('\r\n')
    )

    socket.on('message', (msg, rinfo) => {
      if (rinfo.address !== gatewayIp) return
      const match = msg.toString('utf8').match(/^\s*LOCATION:\s*(.+)$/im)
      if (match && !location) location = match[1].trim()
    })
    socket.on('error', () => undefined)

    socket.bind(0, () => {
      socket.send(message, 1900, '239.255.255.250', () => undefined)
      setTimeout(() => socket.send(message, 1900, '239.255.255.250', () => undefined), 600)
    })

    setTimeout(() => {
      try {
        socket.close()
      } catch {
        /* ignore */
      }
      resolve(location)
    }, timeoutMs)
  })
}

function tag(xml: string, name: string): string | null {
  const match = xml.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`, 'i'))
  return match ? match[1].trim() : null
}

function findControlUrl(description: string, baseUrl: string): { url: string; serviceType: string } | null {
  const serviceBlocks = description.match(/<service>[\s\S]*?<\/service>/gi) ?? []
  for (const block of serviceBlocks) {
    const type = tag(block, 'serviceType')
    if (!type) continue
    if (!/WANIPConnection|WANPPPConnection/i.test(type)) continue
    const control = tag(block, 'controlURL')
    if (!control) continue
    try {
      return { url: new URL(control, baseUrl).toString(), serviceType: type }
    } catch {
      return null
    }
  }
  return null
}

async function fetchExternalIp(controlUrl: string, serviceType: string): Promise<string | null> {
  const body = [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">',
    '<s:Body>',
    `<u:GetExternalIPAddress xmlns:u="${serviceType}"></u:GetExternalIPAddress>`,
    '</s:Body>',
    '</s:Envelope>'
  ].join('')
  const response = await request(controlUrl, {
    method: 'POST',
    timeout: 2500,
    headers: {
      'Content-Type': 'text/xml; charset="utf-8"',
      SOAPAction: `"${serviceType}#GetExternalIPAddress"`,
      'Content-Length': String(Buffer.byteLength(body))
    },
    body
  })
  if (!response?.body) return null
  const ip = tag(response.body, 'NewExternalIPAddress')
  if (!ip || ip === '0.0.0.0') return null
  return ip
}

export async function probeUpnpGateway(gatewayIp: string): Promise<UpnpDevice | null> {
  const location = await discoverGatewayDescription(gatewayIp)
  if (!location) return null

  const description = await request(location, { timeout: 2500 })
  if (!description?.body) return null

  const device = description.body
  const base = location
  const control = findControlUrl(device, base)
  const friendlyName = tag(device, 'friendlyName')
  const modelName = tag(device, 'modelName')
  const manufacturer = tag(device, 'manufacturer')
  const externalIp = control ? await fetchExternalIp(control.url, control.serviceType) : null

  return {
    ip: gatewayIp,
    friendlyName: friendlyName ? decodeXml(friendlyName) : null,
    modelName: modelName ? decodeXml(modelName) : null,
    manufacturer: manufacturer ? decodeXml(manufacturer) : null,
    descriptionUrl: location,
    controlUrl: control?.url ?? null,
    serviceType: control?.serviceType ?? null,
    externalIp
  }
}

export function decodeXml(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/<[^>]+>/g, '')
    .trim()
}

export async function fetchRouterPageTitle(gatewayIp: string): Promise<string | null> {
  for (const url of [`http://${gatewayIp}/`, `http://${gatewayIp}:8080/`, `https://${gatewayIp}/`]) {
    const response = await request(url, { timeout: 1400 })
    if (!response?.body) continue
    const title = response.body.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
    if (title) {
      const text = decodeXml(title[1])
      if (text) return text
    }
  }
  return null
}
