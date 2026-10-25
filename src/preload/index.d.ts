import type {
  AppStateSnapshot,
  Device,
  GatewayConfig,
  GatewayStatus,
  RouterClientsStatus,
  RouterConfig,
  RouterDetection,
  ScanResult,
  Settings,
  SettingsPatch
} from '../shared/types'

export interface NekoBridge {
  getState: () => Promise<AppStateSnapshot>
  scan: () => Promise<ScanResult | null>
  cancelScan: () => Promise<void>
  updateSettings: (patch: SettingsPatch) => Promise<Settings>
  renameDevice: (id: string, name: string) => Promise<Device[]>
  ignoreDevice: (id: string, ignored: boolean) => Promise<Device[]>
  testGateway: (config: GatewayConfig) => Promise<GatewayStatus>
  testRouter: (config: RouterConfig) => Promise<RouterClientsStatus>
  detectRouter: (url: string) => Promise<RouterDetection>
  reconnectGateway: () => Promise<void>
  wakeDevice: (ip: string) => Promise<boolean>
  exportData: () => Promise<string | null>
  openExternal: (url: string) => Promise<void>
  setTheme: (theme: 'dark' | 'light') => void
  onState: (cb: (state: AppStateSnapshot) => void) => () => void
}

declare global {
  interface Window {
    neko: NekoBridge
  }
}

export {}
