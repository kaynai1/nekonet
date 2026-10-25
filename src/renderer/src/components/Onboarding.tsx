import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  PlugZap,
  Router,
  ScanLine,
  Search,
  ShieldCheck,
  Wifi
} from 'lucide-react'
import type { RouterDetection } from '@shared/types'
import { ISP_LABEL, ROUTER_BRAND_LABEL } from '@shared/labels'
import { useApp } from '@/store/app'
import { Logo } from '@/components/Logo'
import { Badge, Button, Dot, Field, Input, Toggle } from '@/components/ui'
import { cn } from '@/lib/format'

const STEPS = ['欢迎', '连接光猫', '完成'] as const

export function Onboarding(): JSX.Element | null {
  const snapshot = useApp((state) => state.snapshot)
  const toast = useApp((state) => state.toast)
  const [step, setStep] = useState(0)
  const [url, setUrl] = useState('http://192.168.1.1')
  const [username, setUsername] = useState('user')
  const [password, setPassword] = useState('')
  const [enabled, setEnabled] = useState(true)
  const [urlTouched, setUrlTouched] = useState(false)
  const [detection, setDetection] = useState<RouterDetection | null>(null)
  const [detecting, setDetecting] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<string | null>(null)

  const settings = snapshot?.settings
  const gateway = snapshot?.network?.active?.gateway ?? null

  useEffect(() => {
    if (!settings) return
    setUrl(settings.router.url || 'http://192.168.1.1')
    setUsername(settings.router.username || 'user')
    setPassword(settings.router.password)
    setEnabled(true)
    setUrlTouched(settings.router.enabled)
  }, [settings])

  useEffect(() => {
    if (!urlTouched && gateway) setUrl(`http://${gateway}`)
  }, [gateway, urlTouched])

  const runDetection = async (): Promise<void> => {
    setDetecting(true)
    try {
      const result = await window.neko.detectRouter(url)
      setDetection(result)
      if (result.reachable && !result.supported) setEnabled(false)
    } catch {
      toast({ title: '识别失败', description: '无法访问这个地址', tone: 'danger' })
    } finally {
      setDetecting(false)
    }
  }

  useEffect(() => {
    if (step !== 1 || detection || detecting) return
    void runDetection()
    // 只在进入第二步时识别一次，地址改动后由按钮手动触发
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step])

  if (!snapshot || !settings) return null

  const finish = async (): Promise<void> => {
    if (enabled && !password.trim()) {
      toast({ title: '还没有填写光猫密码', description: '填好密码再继续，或者关闭光猫读取', tone: 'default' })
      return
    }
    await window.neko.updateSettings({
      onboarded: true,
      router: {
        enabled,
        url: url.trim() || 'http://192.168.1.1',
        username: username.trim() || 'user',
        password
      }
    })
    toast({
      title: enabled ? '配置完成，正在读取光猫' : '配置完成',
      description: enabled ? '首次采样大约需要 30 秒' : '随时可以在设置里开启光猫读取',
      tone: 'success'
    })
    void window.neko.scan().catch(() => undefined)
  }

  const skip = async (): Promise<void> => {
    await window.neko.updateSettings({ onboarded: true })
  }

  const testConnection = async (): Promise<void> => {
    setTesting(true)
    setTestResult(null)
    try {
      const result = await window.neko.testRouter({
        enabled: true,
        url: url.trim() || 'http://192.168.1.1',
        username: username.trim() || 'user',
        password
      })
      setTestResult(
        result.error ? `读取失败：${result.error}` : `连接成功 · 读取到 ${result.count} 台设备`
      )
    } catch {
      setTestResult('连接失败：无法访问管理页面')
    } finally {
      setTesting(false)
    }
  }

  const unsupported = Boolean(detection?.reachable && !detection.supported)
  const brandLabel = detection ? ROUTER_BRAND_LABEL[detection.brand] ?? detection.brand : null
  const ispName = detection?.isp ? ISP_LABEL[detection.isp] : null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-6 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="首次配置"
        className="relative w-full max-w-[560px] overflow-hidden rounded-2xl border border-line/12 bg-canvas shadow-2xl"
      >
        <div className="pointer-events-none absolute -right-20 -top-24 h-56 w-56 rounded-full bg-accent/10 blur-3xl" />
        <div className="relative px-7 pb-5 pt-6">
          <div className="flex items-center gap-2.5">
            <Logo className="h-7 w-7" />
            <span className="text-[13px] font-semibold tracking-tight text-ink">NekoNet</span>
            <span className="text-[11px] text-faint">首次配置</span>
            <div className="ml-auto flex items-center gap-1.5">
              {STEPS.map((label, index) => (
                <span
                  key={label}
                  className={cn(
                    'h-1.5 rounded-full transition-all',
                    index === step ? 'w-5 bg-accent' : 'w-1.5 bg-line/20'
                  )}
                />
              ))}
            </div>
          </div>

          {step === 0 ? (
            <div className="mt-6">
              <h2 className="text-[18px] font-semibold tracking-tight text-ink">
                先花一分钟，认出你家的光猫
              </h2>
              <p className="mt-1.5 text-[11.5px] leading-relaxed text-muted">
                填好一次，之后每次打开都会自动扫描并读取全屋速率。不需要开启系统代理。
              </p>
              <div className="mt-5 space-y-2.5">
                {[
                  { icon: ScanLine, title: '自动扫描局域网', body: 'ARP、mDNS、SSDP 一起上，设备、厂商、开放端口都能看到' },
                  { icon: Router, title: '直接读光猫计数', body: '网口与 Wi-Fi 的累计流量来自光猫本体，不走代理节点' },
                  { icon: ShieldCheck, title: '只存在本机', body: '光猫密码与历史数据保存在你自己的电脑上，不会上传' }
                ].map((item) => {
                  const Icon = item.icon
                  return (
                    <div key={item.title} className="flex items-start gap-3 rounded-xl border border-line/[0.07] bg-line/[0.02] p-3">
                      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
                        <Icon className="h-4 w-4" />
                      </span>
                      <div className="min-w-0">
                        <div className="text-[12px] font-medium text-ink">{item.title}</div>
                        <p className="mt-0.5 text-[11px] leading-relaxed text-muted">{item.body}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : null}

          {step === 1 ? (
            <div className="mt-6">
              <h2 className="text-[18px] font-semibold tracking-tight text-ink">连接家里的光猫</h2>
              <p className="mt-1.5 text-[11.5px] leading-relaxed text-muted">
                地址会自动填成当前网关，账号密码在光猫背面标签上。留空跳过也能正常扫描设备。
              </p>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <Field label="管理地址" htmlFor="onboarding-url" className="sm:col-span-2">
                  <div className="flex gap-2">
                    <Input
                      id="onboarding-url"
                      value={url}
                      onChange={(event) => {
                        setUrl(event.target.value)
                        setUrlTouched(true)
                        setDetection(null)
                        setTestResult(null)
                      }}
                      placeholder="http://192.168.1.1"
                      className="mono"
                      spellCheck={false}
                    />
                    <Button
                      variant="secondary"
                      className="shrink-0"
                      loading={detecting}
                      onClick={() => {
                        setUrlTouched(true)
                        void runDetection()
                      }}
                    >
                      <Search className="h-3 w-3" /> 识别
                    </Button>
                  </div>
                </Field>
                <Field label="管理用户名" htmlFor="onboarding-user" hint="普通账号 user，超级管理员 CMCCAdmin">
                  <Input
                    id="onboarding-user"
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    className="mono"
                    spellCheck={false}
                  />
                </Field>
                <Field label="管理密码" htmlFor="onboarding-password" hint="连续输错会触发光猫延时锁定">
                  <Input
                    id="onboarding-password"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="光猫背面标签上的密码"
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
                      : unsupported
                        ? 'border-warn/25 bg-warn/[0.06] text-warn'
                        : 'border-mint/25 bg-mint/[0.06] text-mint'
                  )}
                >
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-medium">{brandLabel}</span>
                    {ispName ? <span>· {ispName}</span> : null}
                    <span>· {unsupported ? '暂不支持读取流量' : detection.reachable ? '支持读取流量' : '无法访问'}</span>
                  </div>
                  <p className="mt-0.5 opacity-90">{detection.note}</p>
                </div>
              ) : detecting ? (
                <p className="mt-3 text-[11px] text-faint">正在识别光猫型号…</p>
              ) : null}

              <div className="mt-4 flex items-center justify-between rounded-xl border border-line/[0.07] bg-line/[0.02] px-3 py-2.5">
                <div className="min-w-0">
                  <div className="text-[12px] font-medium text-ink">开启光猫读取</div>
                  <p className="mt-0.5 text-[10.5px] leading-relaxed text-muted">
                    读取网口与 Wi-Fi 计数，按 30 秒采样绘制全屋速率曲线
                  </p>
                </div>
                <Toggle checked={enabled} onChange={setEnabled} label="开启光猫读取" />
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  loading={testing}
                  disabled={!password || unsupported}
                  onClick={() => void testConnection()}
                >
                  <PlugZap className="h-3 w-3" /> 测试连接
                </Button>
                {testResult ? (
                  <span className={cn('text-[10.5px]', testResult.startsWith('连接成功') ? 'text-mint' : 'text-warn')}>
                    {testResult}
                  </span>
                ) : (
                  <span className="text-[10.5px] text-faint">
                    支持的账号会自动读取 DHCP 终端表与流量计数
                  </span>
                )}
              </div>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="mt-6">
              <h2 className="text-[18px] font-semibold tracking-tight text-ink">准备就绪</h2>
              <p className="mt-1.5 text-[11.5px] leading-relaxed text-muted">
                关闭向导后会立即开始第一次扫描，设备列表通常十几秒内出现。
              </p>
              <div className="mt-4 space-y-2">
                {[
                  {
                    icon: ScanLine,
                    label: '设备扫描',
                    value: '自动，每 60 秒刷新'
                  },
                  {
                    icon: Router,
                    label: '光猫读取',
                    value: enabled ? (brandLabel ? `${brandLabel}${ispName ? ` · ${ispName}` : ''}` : '已开启') : '未开启，可稍后在设置里打开'
                  },
                  {
                    icon: Wifi,
                    label: '网口与 Wi-Fi',
                    value: enabled ? '网口 / SSID 级累计流量与实时速率' : '开启后可见'
                  },
                  {
                    icon: ShieldCheck,
                    label: '数据位置',
                    value: '仅保存在本机用户目录'
                  }
                ].map((item) => {
                  const Icon = item.icon
                  return (
                    <div key={item.label} className="flex items-center gap-3 rounded-lg border border-line/[0.06] px-3 py-2">
                      <Icon className="h-3.5 w-3.5 shrink-0 text-faint" />
                      <span className="w-20 shrink-0 text-[11px] text-muted">{item.label}</span>
                      <span className="min-w-0 truncate text-[11.5px] text-ink">{item.value}</span>
                      {item.label === '光猫读取' && enabled ? (
                        <Badge tone="mint">
                          <Dot tone="mint" />
                          已开启
                        </Badge>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            </div>
          ) : null}

          <div className="mt-6 flex items-center gap-2 border-t border-line/[0.06] pt-4">
            {step > 0 ? (
              <Button variant="ghost" size="sm" onClick={() => setStep((value) => value - 1)}>
                <ArrowLeft className="h-3 w-3" /> 上一步
              </Button>
            ) : null}
            <Button variant="ghost" size="sm" className="ml-auto" onClick={() => void skip()}>
              跳过
            </Button>
            {step < 2 ? (
              <Button variant="primary" size="sm" onClick={() => setStep((value) => value + 1)}>
                下一步 <ArrowRight className="h-3 w-3" />
              </Button>
            ) : (
              <Button variant="primary" size="sm" onClick={() => void finish()}>
                <Check className="h-3 w-3" /> 开始使用
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
