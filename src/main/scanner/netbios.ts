import dgram from 'node:dgram'
import { pool } from './net'

function encodeName(name: string): Buffer {
  const padded = name.toUpperCase().padEnd(16, '\0').slice(0, 16)
  const encoded = Buffer.alloc(32)
  for (let i = 0; i < 16; i++) {
    const code = padded.charCodeAt(i)
    encoded[i * 2] = 0x41 + ((code >> 4) & 0x0f)
    encoded[i * 2 + 1] = 0x41 + (code & 0x0f)
  }
  return Buffer.concat([Buffer.from([32]), encoded, Buffer.from([0])])
}

function buildQuery(id: number): Buffer {
  const header = Buffer.alloc(12)
  header.writeUInt16BE(id, 0)
  header.writeUInt16BE(0x0000, 2)
  header.writeUInt16BE(1, 4)
  const body = Buffer.from([0x00, 0x21, 0x00, 0x01])
  return Buffer.concat([header, encodeName('*'), body])
}

function parseResponse(buf: Buffer): string | null {
  if (buf.length < 57) return null
  let offset = 12
  if (buf[offset] === 0xc0) {
    offset += 2
  } else {
    while (offset < buf.length && buf[offset] !== 0) offset += buf[offset] + 1
    offset += 1
  }
  if (offset + 10 > buf.length) return null
  offset += 8
  const rdLength = buf.readUInt16BE(offset)
  offset += 2
  if (rdLength < 1 || offset >= buf.length) return null

  const count = buf[offset]
  const names: Array<{ name: string; suffix: number; flags: number }> = []
  for (let i = 0; i < count; i++) {
    const start = offset + 1 + i * 18
    if (start + 18 > buf.length) break
    const raw = buf.subarray(start, start + 15).toString('ascii').trim()
    const suffix = buf[start + 15]
    const flags = buf.readUInt16BE(start + 16)
    if (raw) names.push({ name: raw, suffix, flags })
  }

  const workstation = names.find((n) => n.suffix === 0x00 && (n.flags & 0x8000) === 0)
  if (workstation) return workstation.name
  const unique = names.find((n) => (n.flags & 0x8000) === 0 && n.suffix !== 0x1c)
  return unique ? unique.name : null
}

export async function resolveNetbiosNames(ips: string[], timeoutMs = 1400): Promise<Map<string, string>> {
  const result = new Map<string, string>()
  if (!ips.length) return result

  const socket = dgram.createSocket('udp4')
  const pending = new Set(ips)

  socket.on('message', (msg, rinfo) => {
    if (!pending.has(rinfo.address)) return
    const name = parseResponse(msg)
    pending.delete(rinfo.address)
    if (name) result.set(rinfo.address, name)
  })

  await new Promise<void>((resolve) => {
    socket.bind(0, () => resolve())
  })

  await pool(ips, 16, async (ip, index) => {
    const packet = buildQuery((0x1000 + index) & 0xffff)
    await new Promise<void>((resolve) => {
      try {
        socket.send(packet, 137, ip, () => resolve())
      } catch {
        resolve()
      }
    })
  })

  await new Promise<void>((resolve) => setTimeout(resolve, timeoutMs))
  try {
    socket.close()
  } catch {
    /* ignore */
  }
  return result
}
