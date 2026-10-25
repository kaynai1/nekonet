import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { app, BrowserWindow, Menu, Tray, nativeImage, shell, session, ipcMain } from 'electron'
import type { AppStateSnapshot } from '@shared/types'
import { Store } from './store'
import { AppState } from './state'
import { registerIpc } from './ipc'

const isDev = !app.isPackaged
let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let state: AppState | null = null
let quitting = false

app.setAppUserModelId('app.nekonet.desktop')

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.show()
      mainWindow.focus()
    }
  })
}

function resolveAsset(name: string): string {
  const candidates = [
    join(__dirname, '../../build', name),
    join(__dirname, '../../resources', name),
    join(process.cwd(), 'build', name)
  ]
  return candidates.find((file) => existsSync(file)) ?? candidates[0]
}

function broadcast(snapshot: AppStateSnapshot): void {
  if (!mainWindow || mainWindow.isDestroyed()) return
  mainWindow.webContents.send('app:state', snapshot)
}

function applyTitleBarTheme(theme: 'dark' | 'light'): void {
  if (process.platform === 'darwin') return
  if (!mainWindow || mainWindow.isDestroyed()) return
  const light = theme === 'light'
  mainWindow.setTitleBarOverlay({
    color: light ? '#FFFFFF' : '#0A0D13',
    symbolColor: light ? '#475569' : '#8A94A6',
    height: 40
  })
  mainWindow.setBackgroundColor(light ? '#F5F6FA' : '#080A0F')
}

function createWindow(): void {
  const iconPath = resolveAsset('icon.png')
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1080,
    minHeight: 700,
    show: false,
    backgroundColor: '#080A0F',
    icon: existsSync(iconPath) ? iconPath : undefined,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#0A0D13',
      symbolColor: '#8A94A6',
      height: 40
    },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.webContents.on('will-navigate', (event, url) => {
    const allowed = isDev && process.env.ELECTRON_RENDERER_URL
    if (allowed && url.startsWith(process.env.ELECTRON_RENDERER_URL!)) return
    event.preventDefault()
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
  })

  if (isDev && process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

function createTray(): void {
  const iconPath = resolveAsset('icon.png')
  if (!existsSync(iconPath)) return
  const image = nativeImage.createFromPath(iconPath).resize({ width: 20, height: 20 })
  tray = new Tray(image)
  tray.setToolTip('NekoNet')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: '显示主窗口',
        click: () => {
          mainWindow?.show()
          mainWindow?.focus()
        }
      },
      {
        label: '立即扫描',
        click: () => void state?.scan()
      },
      { type: 'separator' },
      {
        label: '退出',
        click: () => {
          app.quit()
        }
      }
    ])
  )
  tray.on('double-click', () => {
    mainWindow?.show()
    mainWindow?.focus()
  })
}

app.whenReady().then(() => {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    if (isDev) {
      callback({ responseHeaders: details.responseHeaders })
      return
    }
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; script-src 'self'"
        ]
      }
    })
  })

  createWindow()
  createTray()

  ipcMain.on('window:theme', (_event, theme: 'dark' | 'light') => {
    if (theme === 'dark' || theme === 'light') applyTitleBarTheme(theme)
  })

  const store = new Store()
  state = new AppState(store)
  registerIpc(state)
  state.init(broadcast)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', (event) => {
  if (quitting) return
  event.preventDefault()
  quitting = true
  void (async () => {
    await state?.dispose()
    tray?.destroy()
    tray = null
    app.quit()
  })()
})
