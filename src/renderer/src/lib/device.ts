import {
  Camera,
  Cpu,
  Gamepad2,
  HardDrive,
  HelpCircle,
  Laptop,
  Monitor,
  Printer,
  Router,
  Smartphone,
  Speaker,
  Tablet,
  Tv,
  Watch,
  type LucideIcon
} from 'lucide-react'
import type { Device, DeviceType } from '@shared/types'
import { DEVICE_TYPE_LABEL } from '@shared/labels'

export const TYPE_ICON: Record<DeviceType, LucideIcon> = {
  router: Router,
  phone: Smartphone,
  tablet: Tablet,
  laptop: Laptop,
  desktop: Monitor,
  tv: Tv,
  speaker: Speaker,
  camera: Camera,
  printer: Printer,
  nas: HardDrive,
  console: Gamepad2,
  watch: Watch,
  iot: Cpu,
  unknown: HelpCircle
}

export const TYPE_TONE: Record<DeviceType, { text: string; bg: string; ring: string; dot: string }> = {
  router: { text: 'text-tone-violet', bg: 'bg-tone-violet/10', ring: 'ring-tone-violet/25', dot: 'bg-tone-violet' },
  phone: { text: 'text-tone-sky', bg: 'bg-tone-sky/10', ring: 'ring-tone-sky/25', dot: 'bg-tone-sky' },
  tablet: { text: 'text-tone-sky', bg: 'bg-tone-sky/10', ring: 'ring-tone-sky/25', dot: 'bg-tone-sky' },
  laptop: { text: 'text-tone-sky', bg: 'bg-tone-sky/10', ring: 'ring-tone-sky/25', dot: 'bg-tone-sky' },
  desktop: { text: 'text-tone-sky', bg: 'bg-tone-sky/10', ring: 'ring-tone-sky/25', dot: 'bg-tone-sky' },
  tv: { text: 'text-tone-mint', bg: 'bg-tone-mint/10', ring: 'ring-tone-mint/25', dot: 'bg-tone-mint' },
  speaker: { text: 'text-tone-mint', bg: 'bg-tone-mint/10', ring: 'ring-tone-mint/25', dot: 'bg-tone-mint' },
  console: { text: 'text-tone-mint', bg: 'bg-tone-mint/10', ring: 'ring-tone-mint/25', dot: 'bg-tone-mint' },
  camera: { text: 'text-tone-amber', bg: 'bg-tone-amber/10', ring: 'ring-tone-amber/25', dot: 'bg-tone-amber' },
  printer: { text: 'text-tone-amber', bg: 'bg-tone-amber/10', ring: 'ring-tone-amber/25', dot: 'bg-tone-amber' },
  nas: { text: 'text-tone-amber', bg: 'bg-tone-amber/10', ring: 'ring-tone-amber/25', dot: 'bg-tone-amber' },
  watch: { text: 'text-tone-rose', bg: 'bg-tone-rose/10', ring: 'ring-tone-rose/25', dot: 'bg-tone-rose' },
  iot: { text: 'text-tone-rose', bg: 'bg-tone-rose/10', ring: 'ring-tone-rose/25', dot: 'bg-tone-rose' },
  unknown: { text: 'text-muted', bg: 'bg-line/[0.06]', ring: 'ring-line/10', dot: 'bg-muted' }
}

export function deviceLabel(device: Device): string {
  return device.customName || device.hostname || device.vendor || device.ip
}

export function deviceSubtitle(device: Device): string {
  const parts: string[] = []
  if (device.isGateway) parts.push('网关')
  if (device.isSelf) parts.push('本机')
  parts.push(DEVICE_TYPE_LABEL[device.type] ?? '未知设备')
  return parts.join(' · ')
}

export function sortedDevices(devices: Device[], includeIgnored = false): Device[] {
  return devices
    .filter((device) => includeIgnored || !device.ignored)
    .slice()
    .sort((a, b) => {
      if (a.online !== b.online) return a.online ? -1 : 1
      if (a.isGateway !== b.isGateway) return a.isGateway ? -1 : 1
      if (a.isSelf !== b.isSelf) return a.isSelf ? -1 : 1
      return a.ip.localeCompare(b.ip, 'en', { numeric: true })
    })
}
