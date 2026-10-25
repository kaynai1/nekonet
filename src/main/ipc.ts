import { ipcMain } from 'electron'
import type { GatewayConfig, RouterConfig, SettingsPatch } from '@shared/types'
import { AppState } from './state'

export function registerIpc(state: AppState): void {
  ipcMain.handle('app:state', () => state.getState())
  ipcMain.handle('scan:start', () => state.scan())
  ipcMain.handle('scan:cancel', () => state.cancelScan())
  ipcMain.handle('settings:update', (_event, patch: SettingsPatch) => state.updateSettings(patch))
  ipcMain.handle('device:rename', (_event, id: string, name: string) => state.renameDevice(id, name))
  ipcMain.handle('device:ignore', (_event, id: string, ignored: boolean) => state.ignoreDevice(id, ignored))
  ipcMain.handle('gateway:test', (_event, config: GatewayConfig) => state.testGateway(config))
  ipcMain.handle('router:test', (_event, config: RouterConfig) => state.testRouter(config))
  ipcMain.handle('router:detect', (_event, url: string) => state.detectRouter(url))
  ipcMain.handle('gateway:reconnect', () => state.reconnectGateway())
  ipcMain.handle('device:wake', (_event, ip: string) => state.wakeDevice(ip))
  ipcMain.handle('app:export', () => state.exportData())
  ipcMain.handle('app:openExternal', (_event, url: string) => state.openExternal(url))
}
