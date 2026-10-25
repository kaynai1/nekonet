import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import {
  Bell,
  Database,
  Download,
  ExternalLink,
  Globe,
  Info,
  Moon,
  Network,
  PlugZap,
  RefreshCw,
  Router,
  ScanLine,
  Search,
  ShieldCheck,
  Sun
} from 'lucide-react'
import type {
  GatewayConfig,
  GatewayStatus,
  RouterConfig,
  RouterFlowRow,
  SettingsPatch
} from '@shared/types'
import { ISP_LABEL, ROUTER_BRAND_LABEL } from '@shared/labels'
import { useApp } from '@/store/app'
import { Badge, Button, Dot, Field, Input, Panel, SectionHeader, Select, Toggle } from '@/components/ui'
import { PageHeader } from '@/components/PageHeader'
import { activeDetection, normalizeRouterUrl } from '@/lib/router'
import { cn } from '@/lib/format'

const INTERVALS = [
  { value: 30, label: '每 30 秒' },
  { value: 60, label: '每 1 分钟' },
  { value: 300, label: '每 5 分钟' },
  { value: 900, label: '每 15 分钟' },
  { value: 0, label: '仅手动扫描' }
]

function normalizeDraft(url: string): string {
  return normalizeRouterUrl(url)
}

function SettingRow({
  title,
  description,
  children
}: {
  title: string
  description?: string
  children: React.ReactNode
}): JSX.Element {
  return (
    <div className="flex items-start justify-between gap-6 py-3">
      <div className="min-w-0">
        <div className="text-[12.5px] font-medium text-ink">{title}</div>
        {description ? (
          <p className="mt-0.5 text-[11px] leading-relaxed text-muted">{description}</p>
        ) : null}
      </div>
      <div className="shrink-0 pt-0.5">{children}</div>
    </div>
  )
}

function FlowLabelEditor({
  rows,
  labels,
  onCommit
}: {
  rows: RouterFlowRow[]
  labels: Record<string, string>
  onCommit: (key: string, value: string) => void
}): JSX.Element {
  const [draft, setDraft] = useState<Record<string, string>>(labels)

  useEffect(() => {
    setDraft(labels)
  }, [labels])

  return (
    <div className="mt-4 border-t border-line/[0.06] pt-4">
      <div className="text-[12.5px] font-medium text-ink">网口与 Wi-Fi 名称</div>
      <p className="mt-0.5 text-[11px] leading-relaxed text-muted">
        给网口或 SSID 起一个好认的名字，留空则使用自动识别的主机名或 SSID。
      </p>
      {rows.length ? (
        <div className="mt-3 space-y-2">
          {rows.map((row) => (
            <div key={row.key} className="flex items-center gap-3">
              <span className="w-48 shrink-0 truncate text-[11px] text-muted">
                {row.kind === 'wifi' ? 'Wi-Fi' : '网口'} · {row.autoLabel}
              </span>
              <Input
                value={draft[row.key] ?? ''}
                placeholder={row.autoLabel}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, [row.key]: event.target.value }))
                }
                onBlur={(event) => onCommit(row.key, event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') event.currentTarget.blur()
                }}
                spellCheck={false}
              />
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-[11px] text-faint">
          开启光猫读取并等到首次采样后，这里会列出网口与 Wi-Fi。
        </p>
      )}
    </div>
  )
}

export function Settings(): JSX.Element {
  const snapshot = useApp((state) => state.snapshot)
  const toast = useApp((state) => state.toast)
  const [subnet, setSubnet] = useState('')
  const [gatewayDraft, setGatewayDraft] = useState<GatewayConfig>({
    enabled: false,
    url: 'http://127.0.0.1:9090',
    secret: ''
  })
  const [testing, setTesting] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [testResult, setTestResult] = useState<GatewayStatus | null>(null)
  const [subscription, setSubscription] = useState('')
  const [routerDraft, setRouterDraft] = useState<RouterConfig>({
    enabled: false,
    url: 'http://192.168.1.1',
    username: 'user',
    password: ''
  })
  const [routerTesting, setRouterTesting] = useState(false)
  const [detecting, setDetecting] = useState(false)

  const settings = snapshot?.settings

  useEffect(() => {
    setSubnet(settings?.subnet ?? '')
  }, [settings?.subnet])

  useEffect(() => {
    setSubscription(settings?.core.subscriptionUrl ?? '')
  }, [settings?.core.subscriptionUrl])

  useEffect(() => {
    if (!settings) return
    setGatewayDraft({
      enabled: settings.gateway.enabled,
      url: settings.gateway.url,
      secret: settings.gateway.secret
    })
  }, [settings?.gateway.enabled, settings?.gateway.url, settings?.gateway.secret])

  useEffect(() => {
    if (!settings) return
    setRouterDraft({
      enabled: settings.router.enabled,
      url: settings.router.url,
      username: settings.router.username,
      password: settings.router.password
    })
  }, [
    settings?.router.enabled,
    settings?.router.url,
    settings?.router.username,
    settings?.router.password
  ])

  if (!snapshot || !settings) {
    return (
      <div className="flex h-full items-center justify-center text-[12px] text-muted">
        <RefreshCw className="mr-2 h-3.5 w-3.5 animate-spin" /> 正在读取设置…
      </div>
    )
  }

  const apply = async (patch: SettingsPatch, message?: string): Promise<void> => {
    try {
      await window.neko.updateSettings(patch)
      if (message) toast({ title: message, tone: 'success' })
    } catch {
      toast({ title: '保存设置失败', tone: 'danger' })
    }
  }

  const detection = activeDetection(snapshot.routerDetection, routerDraft.url)

  const runDetection = async (): Promise<void> => {
    setDetecting(true)
    try {
      const result = await window.neko.detectRouter(routerDraft.url)
      const name = `${ROUTER_BRAND_LABEL[result.brand] ?? result.brand}${result.isp ? ` · ${ISP_LABEL[result.isp]}` : ''}`
      toast(
        result.reachable
          ? { title: name, description: result.note, tone: result.supported ? 'success' : 'default' }
          : { title: '无法识别光猫', description: result.note, tone: 'danger' }
      )
    } catch {
      toast({ title: '识别失败', description: '无法访问光猫管理页面', tone: 'danger' })
    } finally {
      setDetecting(false)
    }
  }

  const useCurrentGateway = (): void => {
    const gateway = snapshot.network?.active?.gateway
    if (!gateway) {
      toast({ title: '没有检测到默认网关', description: '请先完成一次局域网扫描', tone: 'danger' })
      return
    }
    setRouterDraft((draft) => ({ ...draft, url: `http://${gateway}` }))
  }

  const commitSubnet = (): void => {
    const value = subnet.trim()
    if (value && !/^\d{1,3}(\.\d{1,3}){3}\/\d{1,2}$/.test(value)) {
      toast({ title: '网段格式不正确', description: '示例：192.168.1.0/24', tone: 'danger' })
      return
    }
    const next = value || null
    if (next === (settings.subnet ?? null)) return
    void apply({ subnet: next }, '扫描网段已更新')
  }

  const testConnection = async (): Promise<void> => {
    setTesting(true)
    setTestResult(null)
    try {
      const result = await window.neko.testGateway(gatewayDraft)
      setTestResult(result)
      toast(
        result.connected
          ? { title: '连接成功', description: result.version ?? 'Clash', tone: 'success' }
          : { title: '连接失败', description: result.error ?? '请检查地址与密钥', tone: 'danger' }
      )
    } finally {
      setTesting(false)
    }
  }

  const saveGateway = async (): Promise<void> => {
    await apply(
      {
        gateway: {
          enabled: gatewayDraft.enabled,
          url: gatewayDraft.url.trim(),
          secret: gatewayDraft.secret.trim()
        }
      },
      '流量网关设置已保存'
    )
  }

  const saveRouter = async (): Promise<void> => {
    await apply(
      {
        router: {
          ...routerDraft,
          url: routerDraft.url.trim() || 'http://192.168.1.1',
          username: routerDraft.username.trim() || 'user'
        }
      },
      '路由器发现设置已保存'
    )
  }

  const commitFlowLabel = (key: string, value: string): void => {
    const trimmed = value.trim()
    if ((settings.flowLabels[key] ?? '') === trimmed) return
    const next = { ...settings.flowLabels }
    if (trimmed) next[key] = trimmed
    else delete next[key]
    void apply({ flowLabels: next })
  }

  const testRouter = async (): Promise<void> => {
    setRouterTesting(true)
    try {
      const result = await window.neko.testRouter(routerDraft)
      toast(
        result.error
          ? { title: '读取失败', description: result.error, tone: 'danger' }
          : {
              title: `已读取 ${result.count} 台设备`,
              description: result.count ? '保存设置后下次扫描会并入设备列表' : '路由器返回的客户端列表为空',
              tone: 'success'
            }
      )
    } catch {
      toast({ title: '测试失败', description: '无法连接路由器管理页面', tone: 'danger' })
    } finally {
      setRouterTesting(false)
    }
  }

  const exportData = async (): Promise<void> => {
    setExporting(true)
    try {
      const file = await window.neko.exportData()
      if (file) toast({ title: '已导出网络数据', description: file, tone: 'success' })
    } catch {
      toast({ title: '导出失败', tone: 'danger' })
    } finally {
      setExporting(false)
    }
  }

  const scanning = snapshot.scanning
  const connected = snapshot.gateway.connected
  const core = snapshot.core
  const coreBadge = core.running
    ? { tone: 'mint' as const, label: `内核运行中${core.version ? ` · ${core.version}` : ''}` }
    : !core.available
      ? { tone: 'danger' as const, label: '缺少内核文件' }
      : core.error
        ? { tone: 'danger' as const, label: '启动失败' }
        : settings.core.enabled
          ? { tone: 'warn' as const, label: '启动中' }
          : { tone: 'neutral' as const, label: '未启动' }

  return (
    <>
      <PageHeader title="设置" subtitle="扫描设置即时生效，全部数据仅保存在本机">
        <Button
          size="sm"
          variant="secondary"
          onClick={() => void window.neko.scan()}
          loading={scanning}
        >
          <RefreshCw className="h-3 w-3" /> 立即扫描
        </Button>
      </PageHeader>

      <div className="mx-auto max-w-[900px] space-y-4 px-7 pb-10">
        <Panel className="p-5">
          <SectionHeader title="网络扫描" subtitle="决定多久探测一次局域网，以及使用哪些发现手段" />
          <div className="mt-3 divide-y divide-line/[0.05]">
            <SettingRow title="扫描间隔" description="自动扫描会刷新设备在线状态并发现新接入的设备">
              <Select
                className="w-[150px]"
                value={String(settings.intervalSec)}
                aria-label="扫描间隔"
                onChange={(event) => void apply({ intervalSec: Number(event.target.value) })}
              >
                {INTERVALS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </Select>
            </SettingRow>

            <SettingRow title="扫描网段" description="默认自动使用当前网卡所在网段，留空表示自动检测">
              <Input
                value={subnet}
                onChange={(event) => setSubnet(event.target.value)}
                onBlur={commitSubnet}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') event.currentTarget.blur()
                }}
                placeholder={snapshot.network?.active?.cidr ?? '自动检测'}
                aria-label="扫描网段"
                className="mono w-[210px]"
              />
            </SettingRow>

            <SettingRow title="mDNS 监听" description="识别 Apple、Google Cast、HomeKit 等主动广播的设备">
              <Toggle
                checked={settings.enableMdns}
                onChange={(value) => void apply({ enableMdns: value })}
                label="mDNS 监听"
              />
            </SettingRow>

            <SettingRow title="SSDP / UPnP 监听" description="识别电视、音箱、路由器等 UPnP 设备">
              <Toggle
                checked={settings.enableSsdp}
                onChange={(value) => void apply({ enableSsdp: value })}
                label="SSDP 监听"
              />
            </SettingRow>

            <SettingRow title="NetBIOS 名称解析" description="获取 Windows 设备的主机名与工作组信息">
              <Toggle
                checked={settings.enableNetbios}
                onChange={(value) => void apply({ enableNetbios: value })}
                label="NetBIOS 解析"
              />
            </SettingRow>

            <SettingRow title="端口指纹扫描" description="探测常见服务端口，用于判断设备类型，会略微增加扫描耗时">
              <Toggle
                checked={settings.enablePortScan}
                onChange={(value) => void apply({ enablePortScan: value })}
                label="端口扫描"
              />
            </SettingRow>
          </div>
        </Panel>

        <Panel className="p-5">
          <SectionHeader
            title="光猫读取"
            subtitle="读取 DHCP 终端表与网口 / Wi-Fi 流量计数，休眠设备与全屋速率都能看到，不需要开启系统代理"
            action={
              <Badge tone={settings.router.enabled ? 'mint' : 'neutral'}>
                <Router className="h-3 w-3" />
                {settings.router.enabled ? '已启用' : '未启用'}
              </Badge>
            }
          />
          <div className="mt-3 divide-y divide-line/[0.05]">
            <SettingRow
              title="启用光猫读取"
              description="管理凭据只保存在本机；开启后扫描会并入光猫终端表，流量页显示网口与 Wi-Fi 速率"
            >
              <Toggle
                checked={routerDraft.enabled}
                onChange={(value) => setRouterDraft((draft) => ({ ...draft, enabled: value }))}
                label="启用光猫读取"
              />
            </SettingRow>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Field label="管理地址" htmlFor="router-url">
              <Input
                id="router-url"
                value={routerDraft.url}
                onChange={(event) =>
                  setRouterDraft((draft) => ({ ...draft, url: event.target.value }))
                }
                placeholder="http://192.168.1.1"
                className="mono"
                spellCheck={false}
              />
            </Field>
            <Field label="管理用户名" htmlFor="router-username" hint="普通账号为 user；超级管理员为 CMCCAdmin">
              <Input
                id="router-username"
                value={routerDraft.username}
                onChange={(event) =>
                  setRouterDraft((draft) => ({ ...draft, username: event.target.value }))
                }
                className="mono"
                spellCheck={false}
              />
            </Field>
            <Field
              label="管理密码"
              htmlFor="router-password"
              hint="光猫底部的登录密码；连续输错会触发网关延时锁定"
              className="sm:col-span-2"
            >
              <Input
                id="router-password"
                type="password"
                value={routerDraft.password}
                onChange={(event) =>
                  setRouterDraft((draft) => ({ ...draft, password: event.target.value }))
                }
                placeholder="路由器管理密码"
                className="mono"
                spellCheck={false}
              />
            </Field>
          </div>

          {detection ? (
            <div
              className={cn(
                'mt-3 rounded-lg border px-3 py-2 text-[11px] leading-relaxed',
                !detection.reachable
                  ? 'border-danger/25 bg-danger/[0.06] text-danger'
                  : detection.supported
                    ? 'border-mint/25 bg-mint/[0.06] text-mint'
                    : 'border-warn/25 bg-warn/[0.06] text-warn'
              )}
            >
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="font-medium">{ROUTER_BRAND_LABEL[detection.brand] ?? detection.brand}</span>
                {detection.isp ? <span>· {ISP_LABEL[detection.isp]}</span> : null}
                <span>
                  ·{' '}
                  {!detection.reachable
                    ? '无法访问'
                    : detection.supported
                      ? '可读取网口 / Wi-Fi 流量'
                      : '暂不支持读取流量'}
                </span>
                {detection.title ? (
                  <span className="text-[10px] opacity-70">页面标题：{detection.title}</span>
                ) : null}
              </div>
              <p className="mt-0.5 opacity-90">{detection.note}</p>
            </div>
          ) : null}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button variant="secondary" loading={detecting} onClick={() => void runDetection()}>
              <Search className="h-3 w-3" /> 识别光猫
            </Button>
            <Button
              variant="secondary"
              loading={routerTesting}
              disabled={!routerDraft.password || (detection?.reachable && !detection.supported) === true}
              onClick={() => void testRouter()}
            >
              <PlugZap className="h-3 w-3" /> 测试连接
            </Button>
            <Button variant="primary" onClick={() => void saveRouter()}>
              保存设置
            </Button>
            <Button variant="ghost" onClick={useCurrentGateway}>
              使用当前网关
            </Button>
            <Button
              variant="ghost"
              onClick={() => void window.neko.openExternal(normalizeDraft(routerDraft.url))}
            >
              <ExternalLink className="h-3 w-3" /> 打开光猫后台
            </Button>
            {snapshot.routerClients ? (
              <span className="text-[10.5px] text-faint">
                上次扫描：{snapshot.routerClients.error ? '读取失败' : `读取到 ${snapshot.routerClients.count} 台`}
              </span>
            ) : null}
          </div>

          {snapshot.routerClients?.error ? (
            <div className="mt-3 rounded-lg border border-danger/25 bg-danger/[0.06] px-3 py-2 text-[11px] leading-relaxed text-danger">
              {snapshot.routerClients.error}
            </div>
          ) : null}

          <FlowLabelEditor
            rows={snapshot.routerTraffic?.rows ?? []}
            labels={settings.flowLabels}
            onCommit={commitFlowLabel}
          />

          <p className="mt-3 text-[10.5px] leading-relaxed text-faint">
            光猫同一时间只保留一个管理会话：打开光猫后台网页会让这里的读数短暂中断，稍后会自动重连。
            光猫仅公开网口与 SSID 级累计流量，无线设备无法细分到单台。
          </p>
        </Panel>

        <Panel className="p-5">
          <SectionHeader
            title="内置流量内核"
            subtitle="安装包自带 Mihomo 内核，无需另外下载，一键统计实时流量"
            action={
              <Badge tone={coreBadge.tone}>
                <Dot tone={coreBadge.tone === 'neutral' ? 'muted' : coreBadge.tone} />
                {coreBadge.label}
              </Badge>
            }
          />
          <div className="mt-3 divide-y divide-line/[0.05]">
            <SettingRow
              title="启用内置内核"
              description="启动本机 Mihomo 进程，混合代理端口 7890，控制器仅监听本机 9090"
            >
              <Toggle
                checked={settings.core.enabled}
                onChange={(value) => void apply({ core: { enabled: value } })}
                label="启用内置内核"
              />
            </SettingRow>
            <SettingRow
              title="设为系统代理"
              description="把 Windows 系统代理指向 127.0.0.1:7890，关闭或退出时自动还原"
            >
              <Toggle
                checked={settings.core.systemProxy}
                onChange={(value) => void apply({ core: { systemProxy: value } })}
                label="设为系统代理"
              />
            </SettingRow>
          </div>

          <div className="mt-4">
            <Field
              label="订阅地址（可选）"
              htmlFor="core-subscription"
              hint="Mihomo / Clash 订阅链接，留空则直连；填写后自动下载节点并每日更新"
            >
              <Input
                id="core-subscription"
                value={subscription}
                onChange={(event) => setSubscription(event.target.value)}
                onBlur={() => {
                  const next = subscription.trim()
                  if (next !== settings.core.subscriptionUrl) {
                    void apply({ core: { subscriptionUrl: next } }, '订阅已保存，内核正在重启')
                  }
                }}
                placeholder="https://example.com/subscribe?token=..."
                className="mono"
                spellCheck={false}
              />
            </Field>
          </div>

          {core.error ? (
            <div className="mt-3 rounded-lg border border-danger/25 bg-danger/[0.06] px-3 py-2 text-[11px] leading-relaxed text-danger">
              内核异常 · {core.error}
            </div>
          ) : null}

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[10.5px] text-faint">
            <span>
              代理端口 <span className="mono text-muted">7890</span>
            </span>
            <span>
              控制器 <span className="mono text-muted">127.0.0.1:9090</span>
            </span>
            <span>仅本机可用，不会向局域网开放代理端口</span>
          </div>
        </Panel>

        <Panel className="p-5">
          <SectionHeader
            title="外部控制器"
            subtitle={
              settings.core.enabled
                ? '内置内核启用时此项不生效'
                : '对接已在运行的 Clash / Mihomo，读取实时流量与连接明细'
            }
            action={
              <Badge tone={connected ? 'mint' : gatewayDraft.enabled ? 'warn' : 'neutral'}>
                <Dot tone={connected ? 'mint' : gatewayDraft.enabled ? 'warn' : 'muted'} />
                {connected
                  ? `${snapshot.gateway.version ?? 'Clash'} 已连接`
                  : gatewayDraft.enabled
                    ? '未连接'
                    : '未启用'}
              </Badge>
            }
          />
          <div className="mt-3 divide-y divide-line/[0.05]">
            <SettingRow title="启用实时流量" description="开启后会持续连接控制器，占用极少的本机资源">
              <Toggle
                checked={gatewayDraft.enabled}
                disabled={settings.core.enabled}
                onChange={(value) => setGatewayDraft((draft) => ({ ...draft, enabled: value }))}
                label="启用实时流量"
              />
            </SettingRow>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_200px]">
            <Field label="控制器地址" htmlFor="gateway-url" hint="Mihomo / Clash 配置项 external-controller 的地址">
              <Input
                id="gateway-url"
                value={gatewayDraft.url}
                disabled={settings.core.enabled}
                onChange={(event) => setGatewayDraft((draft) => ({ ...draft, url: event.target.value }))}
                placeholder="http://127.0.0.1:9090"
                className="mono"
                spellCheck={false}
              />
            </Field>
            <Field label="密钥" htmlFor="gateway-secret" hint="未设置 secret 时留空">
              <Input
                id="gateway-secret"
                type="password"
                value={gatewayDraft.secret}
                disabled={settings.core.enabled}
                onChange={(event) => setGatewayDraft((draft) => ({ ...draft, secret: event.target.value }))}
                placeholder="可留空"
                className="mono"
                spellCheck={false}
              />
            </Field>
          </div>

          {testResult ? (
            <div
              className={cn(
                'mt-3 rounded-lg border px-3 py-2 text-[11px]',
                testResult.connected
                  ? 'border-mint/25 bg-mint/[0.06] text-mint'
                  : 'border-danger/25 bg-danger/[0.06] text-danger'
              )}
            >
              {testResult.connected
                ? `连接成功 · ${testResult.version ?? 'Clash'}${testResult.node ? ` · 节点 ${testResult.node}` : ''}`
                : `连接失败 · ${testResult.error ?? '未知错误'}`}
            </div>
          ) : null}

          <div className="mt-4 flex items-center gap-2">
            <Button
              variant="secondary"
              disabled={settings.core.enabled}
              onClick={() => void testConnection()}
              loading={testing}
            >
              <PlugZap className="h-3.5 w-3.5" /> 测试连接
            </Button>
            <Button
              variant="primary"
              disabled={settings.core.enabled}
              onClick={() => void saveGateway()}
            >
              保存并应用
            </Button>
            {connected ? (
              <Button variant="ghost" onClick={() => void window.neko.reconnectGateway()}>
                <RefreshCw className="h-3.5 w-3.5" /> 重新连接
              </Button>
            ) : null}
            <span className="ml-auto text-[10.5px] text-faint">
              需要 Clash / Mihomo 开启 external-controller
            </span>
          </div>
        </Panel>

        <div className="grid grid-cols-12 gap-4">
          <Panel className="col-span-12 p-5 lg:col-span-7">
            <SectionHeader title="通知与外观" subtitle="发现新设备时提醒，以及界面主题" />
            <div className="mt-3 divide-y divide-line/[0.05]">
              <SettingRow title="新设备提醒" description="扫描到从未见过的设备时发送系统通知">
                <div className="flex items-center gap-2">
                  <Bell className="h-3.5 w-3.5 text-faint" />
                  <Toggle
                    checked={settings.notifications}
                    onChange={(value) => void apply({ notifications: value })}
                    label="新设备提醒"
                  />
                </div>
              </SettingRow>

              <SettingRow title="界面主题" description="浅色主题适合白天或投屏演示">
                <div className="flex items-center gap-0.5 rounded-lg border border-line/10 bg-line/[0.04] p-0.5">
                  <button
                    type="button"
                    onClick={() => void apply({ theme: 'dark' })}
                    aria-pressed={settings.theme === 'dark'}
                    className={cn(
                      'flex cursor-pointer items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] transition-colors focus-ring',
                      settings.theme === 'dark' ? 'bg-line/[0.09] text-ink' : 'text-muted hover:text-ink'
                    )}
                  >
                    <Moon className="h-3 w-3" /> 深色
                  </button>
                  <button
                    type="button"
                    onClick={() => void apply({ theme: 'light' })}
                    aria-pressed={settings.theme === 'light'}
                    className={cn(
                      'flex cursor-pointer items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] transition-colors focus-ring',
                      settings.theme === 'light' ? 'bg-line/[0.09] text-ink' : 'text-muted hover:text-ink'
                    )}
                  >
                    <Sun className="h-3 w-3" /> 浅色
                  </button>
                </div>
              </SettingRow>
            </div>
          </Panel>

          <Panel className="col-span-12 p-5 lg:col-span-5">
            <SectionHeader title="数据" subtitle="设备记录与扫描历史保存在本地" />
            <div className="mt-4 space-y-3">
              <div className="flex items-start gap-2.5 rounded-xl border border-line/[0.07] bg-line/[0.02] p-3">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-mint" />
                <p className="text-[11px] leading-relaxed text-muted">
                  全部数据保存在本机用户目录的 JSON 文件中，不会上传到任何服务器。公网 IP 查询只发送请求本身，不附带设备信息。
                </p>
              </div>
              <Button
                variant="secondary"
                className="w-full"
                onClick={() => void exportData()}
                loading={exporting}
              >
                <Download className="h-3.5 w-3.5" /> 导出网络数据
              </Button>
              <div className="flex items-center justify-between text-[10.5px] text-faint">
                <span className="flex items-center gap-1.5">
                  <Database className="h-3 w-3" /> 本地存储
                </span>
                <span className="mono">{snapshot.devices.length} 台设备 · {snapshot.events.length} 条记录</span>
              </div>
            </div>
          </Panel>
        </div>

        <Panel className="p-5">
          <SectionHeader title="关于" subtitle="NekoNet · 家庭网络透视" />
          <div className="mt-4 grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
            {[
              { icon: Info, label: '版本', value: 'v0.1.0' },
              { icon: ScanLine, label: '发现方式', value: 'ARP · mDNS · SSDP · NetBIOS · TCP' },
              { icon: Network, label: '本机地址', value: snapshot.network?.active?.ip ?? '未连接' },
              { icon: Globe, label: 'IPv6 地址', value: snapshot.network?.ipv6?.address ?? '未启用' },
              {
                icon: PlugZap,
                label: '流量来源',
                value: connected ? `Clash / Mihomo ${snapshot.gateway.version ?? ''}` : '未连接'
              }
            ].map((item) => {
              const Icon = item.icon
              return (
                <div key={item.label} className="flex items-start gap-2.5">
                  <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-faint" />
                  <div className="min-w-0">
                    <div className="text-[10px] uppercase tracking-[0.08em] text-faint">{item.label}</div>
                    <div className="mono mt-0.5 truncate text-[11.5px] text-ink">{item.value}</div>
                  </div>
                </div>
              )
            })}
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-line/[0.06] pt-4">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void window.neko.openExternal('https://github.com/foru17/neko-master')}
            >
              <ExternalLink className="h-3 w-3" /> 参考项目 neko-master
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void window.neko.openExternal('https://github.com/MetaCubeX/mihomo')}
            >
              <ExternalLink className="h-3 w-3" /> Mihomo 文档
            </Button>
            <Button size="sm" variant="ghost" onClick={() => void apply({ onboarded: false })}>
              <Router className="h-3 w-3" /> 重新运行首次配置
            </Button>
            <span className="ml-auto text-[10.5px] text-faint">本地运行 · 无账号 · 无云端</span>
          </div>
        </Panel>
      </div>
    </>
  )
}
