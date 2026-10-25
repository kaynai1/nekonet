import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import { Check, Copy, Power, X } from 'lucide-react'
import type { Device } from '@shared/types'
import { DEVICE_TYPE_LABEL, EVIDENCE_LABEL, SERVICE_LABEL } from '@shared/labels'
import { useApp } from '@/store/app'
import { Badge, Button, Dot, IconButton, Input } from '@/components/ui'
import { TYPE_ICON, TYPE_TONE, deviceLabel } from '@/lib/device'
import { cn, formatBytes, formatDateTime, timeAgo } from '@/lib/format'

function Fact({
  label,
  value,
  mono = true,
  onCopy
}: {
  label: string
  value: string
  mono?: boolean
  onCopy?: () => void
}): JSX.Element {
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-[0.08em] text-faint">{label}</div>
      <div className="mt-1 flex items-center gap-1.5">
        <span className={cn('truncate text-[12px] text-ink', mono && 'mono')}>{value || '—'}</span>
        {onCopy ? (
          <button
            type="button"
            aria-label={`复制${label}`}
            onClick={onCopy}
            className="shrink-0 cursor-pointer text-faint transition-colors hover:text-ink focus-ring"
          >
            <Copy className="h-3 w-3" />
          </button>
        ) : null}
      </div>
    </div>
  )
}

function Block({ title, children }: { title: string; children: React.ReactNode }): JSX.Element {
  return (
    <section>
      <h3 className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.09em] text-faint">{title}</h3>
      {children}
    </section>
  )
}

export function DeviceDrawer(): JSX.Element | null {
  const snapshot = useApp((state) => state.snapshot)
  const selectedId = useApp((state) => state.selectedId)
  const select = useApp((state) => state.select)
  const toast = useApp((state) => state.toast)
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)

  const device = snapshot?.devices.find((item) => item.id === selectedId) ?? null

  useEffect(() => {
    setName(device?.customName ?? '')
  }, [device?.id, device?.customName])

  useEffect(() => {
    if (!selectedId) return
    const handler = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') select(null)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [selectedId, select])

  if (!device) return null

  const Icon = TYPE_ICON[device.type]
  const tone = TYPE_TONE[device.type]

  const copy = async (value: string, label: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(value)
      toast({ title: `已复制${label}`, description: value, tone: 'success' })
    } catch {
      toast({ title: '复制失败', tone: 'danger' })
    }
  }

  const saveName = async (): Promise<void> => {
    setSaving(true)
    try {
      await window.neko.renameDevice(device.id, name)
      toast({ title: '设备名称已更新', tone: 'success' })
    } finally {
      setSaving(false)
    }
  }

  const wake = async (): Promise<void> => {
    const ok = await window.neko.wakeDevice(device.ip)
    toast(
      ok
        ? { title: '已发送唤醒指令', description: '设备需要支持网络唤醒（WOL）', tone: 'success' }
        : { title: '无法唤醒', description: '未获取到有效的 MAC 地址', tone: 'danger' }
    )
  }

  const toggleIgnore = async (): Promise<void> => {
    await window.neko.ignoreDevice(device.id, !device.ignored)
    toast({ title: device.ignored ? '已恢复该设备' : '已忽略该设备', tone: 'success' })
    select(null)
  }

  return (
    <div className="fixed inset-0 z-40">
      <button
        type="button"
        aria-label="关闭详情"
        onClick={() => select(null)}
        className="absolute inset-0 cursor-default bg-black/45 backdrop-blur-[2px]"
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={`${deviceLabel(device)} 详情`}
        className="absolute right-0 top-0 flex h-full w-[450px] animate-fade-up flex-col border-l border-line/10 bg-surface shadow-2xl"
      >
        <div className="flex items-start gap-3 border-b border-line/[0.07] px-5 py-4">
          <div
            className={cn(
              'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-line/10',
              tone.bg,
              tone.text
            )}
          >
            <Icon className="h-5 w-5" strokeWidth={1.7} />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[15px] font-semibold text-ink">{deviceLabel(device)}</h2>
            <div className="mt-1 flex items-center gap-2 text-[11px] text-muted">
              <Dot tone={device.online ? 'mint' : 'muted'} pulse={device.online} />
              <span>{device.online ? '在线' : '离线'}</span>
              <span className="text-faint">·</span>
              <span>{DEVICE_TYPE_LABEL[device.type] ?? '未知设备'}</span>
              {device.confidence > 0 ? (
                <Badge tone={device.confidence >= 0.85 ? 'mint' : device.confidence >= 0.6 ? 'accent' : 'neutral'}>
                  {Math.round(device.confidence * 100)}%
                </Badge>
              ) : null}
            </div>
          </div>
          <IconButton label="关闭" onClick={() => select(null)}>
            <X className="h-4 w-4" />
          </IconButton>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
          <Block title="身份信息">
            <div className="grid grid-cols-2 gap-x-4 gap-y-3.5">
              <Fact label="IP 地址" value={device.ip} onCopy={() => void copy(device.ip, 'IP 地址')} />
              <Fact
                label="MAC 地址"
                value={device.mac ? device.mac.toUpperCase() : '—'}
                onCopy={device.mac ? () => void copy(device.mac!, 'MAC 地址') : undefined}
              />
              <Fact label="厂商" value={device.vendor ?? '未知'} mono={false} />
              <Fact label="型号" value={device.model ?? '—'} mono={false} />
              <Fact label="主机名" value={device.hostname ?? '—'} onCopy={device.hostname ? () => void copy(device.hostname!, '主机名') : undefined} />
              <Fact label="网关延迟" value={device.latencyMs !== null ? `${device.latencyMs.toFixed(1)} ms` : '—'} />
            </div>

            <div className="mt-4 flex gap-2">
              <Input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="给设备起个名字，例如「客厅电视」"
                aria-label="设备名称"
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void saveName()
                }}
              />
              <Button variant="secondary" onClick={() => void saveName()} loading={saving} className="shrink-0">
                <Check className="h-3.5 w-3.5" /> 保存
              </Button>
            </div>
          </Block>

          <Block title="识别依据">
            {device.evidence.length ? (
              <ul className="space-y-1.5">
                {device.evidence.map((item) => (
                  <li key={`${item.kind}-${item.label}`} className="flex items-start gap-2 text-[11.5px] text-muted">
                    <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-accent/70" />
                    <span>
                      <span className="mr-1.5 text-[10px] uppercase tracking-wide text-faint">
                        {EVIDENCE_LABEL[item.kind]}
                      </span>
                      {item.label}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[11.5px] text-faint">仅通过 ARP 表发现，未获得更多特征。</p>
            )}
          </Block>

          <Block title={`开放端口 · ${device.ports.length}`}>
            {device.ports.length ? (
              <div className="flex flex-wrap gap-1.5">
                {device.ports.map((port) => (
                  <span
                    key={port.port}
                    className="mono inline-flex items-center gap-1.5 rounded-md border border-line/10 bg-line/[0.04] px-2 py-1 text-[10.5px] text-muted"
                  >
                    <span className="text-ink">{port.port}</span>
                    <span className="text-faint">{SERVICE_LABEL[port.service] ?? port.service}</span>
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-[11.5px] text-faint">未发现开放端口，设备可能开启了防火墙。</p>
            )}
          </Block>

          <Block title="广播服务">
            {device.services.length ? (
              <div className="flex flex-wrap gap-1.5">
                {device.services.map((service) => (
                  <Badge key={service} tone="neutral">
                    {SERVICE_LABEL[service] ?? service}
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-[11.5px] text-faint">未监听到 mDNS / SSDP 广播。</p>
            )}
          </Block>

          <Block title="活动记录">
            <div className="grid grid-cols-2 gap-x-4 gap-y-3.5">
              <Fact label="首次发现" value={formatDateTime(device.firstSeen)} mono={false} />
              <Fact label="最近在线" value={timeAgo(device.lastSeen)} mono={false} />
              <Fact label="本次会话下行" value={formatBytes(device.traffic.down)} />
              <Fact label="本次会话上行" value={formatBytes(device.traffic.up)} />
            </div>
          </Block>
        </div>

        <div className="flex items-center gap-2 border-t border-line/[0.07] px-5 py-3">
          <Button variant="secondary" size="sm" onClick={() => void copy(device.ip, 'IP 地址')}>
            <Copy className="h-3 w-3" /> 复制 IP
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={!device.mac || device.online}
            onClick={() => void wake()}
            title={!device.mac ? '缺少 MAC 地址' : device.online ? '设备已在线' : '发送网络唤醒包'}
          >
            <Power className="h-3 w-3" /> 唤醒
          </Button>
          <Button variant="ghost" size="sm" className="ml-auto" onClick={() => void toggleIgnore()}>
            {device.ignored ? '恢复显示' : '忽略设备'}
          </Button>
        </div>
      </aside>
    </div>
  )
}
