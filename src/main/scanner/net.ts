export function ipToInt(ip: string): number {
  return (
    ip
      .split('.')
      .reduce((acc, part) => (acc << 8) + (Number(part) & 255), 0) >>> 0
  )
}

export function intToIp(value: number): string {
  return [24, 16, 8, 0].map((shift) => (value >>> shift) & 255).join('.')
}

export function prefixToNetmask(prefix: number): string {
  return intToIp(prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0)
}

export function isPrivateIp(ip: string): boolean {
  const n = ipToInt(ip)
  const a = (n >>> 24) & 255
  const b = (n >>> 16) & 255
  return (
    a === 10 ||
    a === 127 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254)
  )
}

export function isValidIp(ip: unknown): boolean {
  if (typeof ip !== 'string') return false
  const parts = ip.split('.')
  return (
    parts.length === 4 &&
    parts.every((p) => /^\d{1,3}$/.test(p) && Number(p) >= 0 && Number(p) <= 255)
  )
}

export function hostsInSubnet(ip: string, prefix: number): string[] {
  if (prefix < 16 || prefix > 30) return []
  const base = ipToInt(ip)
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0
  const network = (base & mask) >>> 0
  const broadcast = (network + (2 ** (32 - prefix) - 1)) >>> 0
  const self = base
  const hosts: string[] = []
  for (let n = network + 1; n < broadcast; n++) {
    if (n !== self) hosts.push(intToIp(n))
  }
  return hosts
}

export async function pool<T, R>(
  items: T[],
  concurrency: number,
  task: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let cursor = 0
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++
      results[index] = await task(items[index], index)
    }
  })
  await Promise.all(workers)
  return results
}
