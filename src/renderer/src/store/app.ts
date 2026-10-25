import { create } from 'zustand'
import type { AppStateSnapshot } from '@shared/types'

export type Page = 'overview' | 'devices' | 'traffic' | 'settings'

export interface ToastItem {
  id: string
  title: string
  description?: string
  tone: 'default' | 'success' | 'danger'
}

interface AppStore {
  snapshot: AppStateSnapshot | null
  ready: boolean
  page: Page
  selectedId: string | null
  showIgnored: boolean
  toasts: ToastItem[]
  setPage: (page: Page) => void
  select: (id: string | null) => void
  setShowIgnored: (value: boolean) => void
  toast: (item: Omit<ToastItem, 'id'> & { id?: string }) => void
  dismiss: (id: string) => void
  bootstrap: () => Promise<void>
}

let subscribed = false

export const useApp = create<AppStore>((set, get) => ({
  snapshot: null,
  ready: false,
  page: 'overview',
  selectedId: null,
  showIgnored: false,
  toasts: [],
  setPage: (page) => set({ page }),
  select: (id) => set({ selectedId: id }),
  setShowIgnored: (value) => set({ showIgnored: value }),
  toast: (item) => {
    const id = item.id ?? `${Date.now()}-${Math.random().toString(16).slice(2, 6)}`
    set({ toasts: [...get().toasts, { ...item, id }].slice(-4) })
    setTimeout(() => get().dismiss(id), 4200)
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((toast) => toast.id !== id) }),
  bootstrap: async () => {
    if (!window.neko) return
    const snapshot = await window.neko.getState()
    set({ snapshot, ready: true })
    if (!subscribed) {
      subscribed = true
      window.neko.onState((next) => set({ snapshot: next }))
    }
  }
}))
