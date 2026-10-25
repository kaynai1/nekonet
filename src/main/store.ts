import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import type {
  Device,
  NetworkSnapshot,
  RouterTrafficHistory,
  Settings,
  TimelineEvent
} from '@shared/types'

export interface PersistedData {
  settings: Settings
  devices: Device[]
  events: TimelineEvent[]
  network: NetworkSnapshot | null
  routerHistory: RouterTrafficHistory
  lastScanAt: number | null
}

export const DEFAULT_SETTINGS: Settings = {
  subnet: null,
  intervalSec: 60,
  enableMdns: true,
  enableSsdp: true,
  enableNetbios: true,
  enablePortScan: true,
  notifications: true,
  theme: 'dark',
  onboarded: false,
  gateway: {
    enabled: false,
    url: 'http://127.0.0.1:9090',
    secret: ''
  },
  core: {
    enabled: false,
    subscriptionUrl: '',
    systemProxy: false
  },
  router: {
    enabled: false,
    url: 'http://192.168.1.1',
    username: 'user',
    password: ''
  },
  flowLabels: {}
}

const EMPTY: PersistedData = {
  settings: DEFAULT_SETTINGS,
  devices: [],
  events: [],
  network: null,
  routerHistory: { samples: [], minutes: [] },
  lastScanAt: null
}

export class Store {
  private file: string
  private writeTimer: NodeJS.Timeout | null = null
  data: PersistedData

  constructor(fileName = 'nekonet-data.json') {
    this.file = path.join(app.getPath('userData'), fileName)
    this.data = this.read()
  }

  get path(): string {
    return this.file
  }

  private read(): PersistedData {
    try {
      const raw = fs.readFileSync(this.file, 'utf8')
      const parsed = JSON.parse(raw) as Partial<PersistedData>
      return {
        settings: {
          ...DEFAULT_SETTINGS,
          ...(parsed.settings ?? {}),
          gateway: { ...DEFAULT_SETTINGS.gateway, ...(parsed.settings?.gateway ?? {}) },
          core: { ...DEFAULT_SETTINGS.core, ...(parsed.settings?.core ?? {}) },
          router: { ...DEFAULT_SETTINGS.router, ...(parsed.settings?.router ?? {}) }
        },
        devices: Array.isArray(parsed.devices) ? parsed.devices : [],
        events: Array.isArray(parsed.events) ? parsed.events : [],
        network: parsed.network ?? null,
        routerHistory: {
          samples: Array.isArray(parsed.routerHistory?.samples) ? parsed.routerHistory.samples : [],
          minutes: Array.isArray(parsed.routerHistory?.minutes) ? parsed.routerHistory.minutes : []
        },
        lastScanAt: parsed.lastScanAt ?? null
      }
    } catch {
      return { ...EMPTY }
    }
  }

  save(patch: Partial<PersistedData>): void {
    this.data = { ...this.data, ...patch }
    if (this.writeTimer) return
    this.writeTimer = setTimeout(() => {
      this.writeTimer = null
      void this.flush()
    }, 500)
  }

  async flush(): Promise<void> {
    try {
      await fs.promises.mkdir(path.dirname(this.file), { recursive: true })
      await fs.promises.writeFile(this.file, JSON.stringify(this.data, null, 2), 'utf8')
    } catch {
      /* ignore disk errors */
    }
  }

  reset(): void {
    this.data = { ...EMPTY, settings: this.data.settings }
    this.save({})
  }
}
