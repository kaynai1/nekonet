import { useEffect } from 'react'
import type { JSX } from 'react'
import { useApp, type Page } from '@/store/app'
import { TitleBar } from '@/components/TitleBar'
import { Sidebar } from '@/components/Sidebar'
import { Logo } from '@/components/Logo'
import { DeviceDrawer } from '@/components/DeviceDrawer'
import { Onboarding } from '@/components/Onboarding'
import { Toasts } from '@/components/Toasts'
import { Overview } from '@/pages/Overview'
import { Devices } from '@/pages/Devices'
import { Traffic } from '@/pages/Traffic'
import { Settings } from '@/pages/Settings'

export default function App(): JSX.Element {
  const bootstrap = useApp((state) => state.bootstrap)
  const setPage = useApp((state) => state.setPage)
  const ready = useApp((state) => state.ready)
  const page = useApp((state) => state.page)
  const onboarded = useApp((state) => state.snapshot?.settings.onboarded)
  const theme = useApp((state) => state.snapshot?.settings.theme ?? 'dark')

  useEffect(() => {
    void bootstrap()
  }, [bootstrap])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    window.neko?.setTheme?.(theme)
  }, [theme])

  useEffect(() => {
    const shortcuts: Record<string, Page> = {
      '1': 'overview',
      '2': 'devices',
      '3': 'traffic',
      '4': 'settings'
    }
    const handler = (event: KeyboardEvent): void => {
      if (!event.ctrlKey && !event.metaKey) return
      const target = shortcuts[event.key]
      if (!target) return
      event.preventDefault()
      setPage(target)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [setPage])

  return (
    <div className="flex h-full flex-col overflow-hidden bg-canvas text-ink">
      <TitleBar />
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <main className="app-bg min-w-0 flex-1 overflow-y-auto">
          {!ready ? (
            <div className="flex h-full flex-col items-center justify-center gap-4">
              <div className="relative">
                <span className="absolute inset-0 -z-10 animate-pulse rounded-full bg-accent/25 blur-xl" />
                <Logo className="h-10 w-10" />
              </div>
              <p className="text-[12px] text-muted">正在初始化 NekoNet…</p>
            </div>
          ) : page === 'overview' ? (
            <Overview />
          ) : page === 'devices' ? (
            <Devices />
          ) : page === 'traffic' ? (
            <Traffic />
          ) : (
            <Settings />
          )}
        </main>
      </div>
      <DeviceDrawer />
      <Toasts />
      {ready && onboarded === false ? <Onboarding /> : null}
    </div>
  )
}
