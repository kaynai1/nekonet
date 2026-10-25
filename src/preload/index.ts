import { contextBridge, ipcRenderer } from 'electron'
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
} from '@shared/types'

const api = {
  getState: (): Promise<AppStateSnapshot> => ipcRenderer.invoke('app:state'),
  scan: (): Promise<ScanResult | null> => ipcRenderer.invoke('scan:start'),
  cancelScan: (): Promise<void> => ipcRenderer.invoke('scan:cancel'),
  updateSettings: (patch: SettingsPatch): Promise<Settings> =>
    ipcRenderer.invoke('settings:update', patch),
  renameDevice: (id: string, name: string): Promise<Device[]> =>
    ipcRenderer.invoke('device:rename', id, name),
  ignoreDevice: (id: string, ignored: boolean): Promise<Device[]> =>
    ipcRenderer.invoke('device:ignore', id, ignored),
  testGateway: (config: GatewayConfig): Promise<GatewayStatus> =>
    ipcRenderer.invoke('gateway:test', config),
  testRouter: (config: RouterConfig): Promise<RouterClientsStatus> =>
    ipcRenderer.invoke('router:test', config),
  detectRouter: (url: string): Promise<RouterDetection> =>
    ipcRenderer.invoke('router:detect', url),
  reconnectGateway: (): Promise<void> => ipcRenderer.invoke('gateway:reconnect'),
  wakeDevice: (ip: string): Promise<boolean> => ipcRenderer.invoke('device:wake', ip),
  exportData: (): Promise<string | null> => ipcRenderer.invoke('app:export'),
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke('app:openExternal', url),
  setTheme: (theme: 'dark' | 'light'): void => {
    ipcRenderer.send('window:theme', theme)
  },
  onState: (cb: (state: AppStateSnapshot) => void): (() => void) => {
    const handler = (_event: unknown, snapshot: AppStateSnapshot): void => cb(snapshot)
    ipcRenderer.on('app:state', handler)
    return () => {
      ipcRenderer.removeListener('app:state', handler)
    }
  }
}

contextBridge.exposeInMainWorld('neko', api)
