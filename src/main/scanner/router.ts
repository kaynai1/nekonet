import type { RouterInfo } from '@shared/types'
import { pingHost, tcpProbe } from './probe'
import { probeUpnpGateway, fetchRouterPageTitle } from './upnp'

const ROUTER_PORTS = [53, 80, 443, 22, 23, 7547, 8080, 8443, 49152, 1900]

export async function collectRouter(gatewayIp: string): Promise<RouterInfo> {
  const [latency, openPorts, upnp] = await Promise.all([
    pingHost(gatewayIp, 500),
    (async () => {
      const results = await Promise.all(ROUTER_PORTS.map(async (port) => ((await tcpProbe(gatewayIp, port, 700)) ? port : null)))
      return results.filter((p): p is number => p !== null)
    })(),
    probeUpnpGateway(gatewayIp)
  ])

  let name = upnp?.friendlyName ?? null
  let model = upnp?.modelName ?? null
  const manufacturer = upnp?.manufacturer ?? null

  if (!name) {
    const title = await fetchRouterPageTitle(gatewayIp)
    if (title) name = title
  }

  return {
    ip: gatewayIp,
    name,
    model,
    manufacturer,
    externalIp: upnp?.externalIp ?? null,
    upnp: !!upnp?.controlUrl,
    latencyMs: latency,
    openPorts
  }
}
