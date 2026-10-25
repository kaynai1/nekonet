import type { JSX } from 'react'
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react'
import { useApp } from '@/store/app'
import { cn } from '@/lib/format'

export function Toasts(): JSX.Element {
  const toasts = useApp((state) => state.toasts)
  const dismiss = useApp((state) => state.dismiss)

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[300px] flex-col gap-2">
      {toasts.map((toast) => {
        const Icon = toast.tone === 'success' ? CheckCircle2 : toast.tone === 'danger' ? AlertCircle : Info
        return (
          <div
            key={toast.id}
            role="status"
            className={cn(
              'pointer-events-auto flex animate-fade-up items-start gap-2.5 rounded-xl border bg-surface/95 px-3 py-2.5 shadow-xl backdrop-blur',
              toast.tone === 'success'
                ? 'border-mint/25'
                : toast.tone === 'danger'
                  ? 'border-danger/25'
                  : 'border-line/10'
            )}
          >
            <Icon
              className={cn(
                'mt-0.5 h-3.5 w-3.5 shrink-0',
                toast.tone === 'success' ? 'text-mint' : toast.tone === 'danger' ? 'text-danger' : 'text-accent'
              )}
            />
            <div className="min-w-0 flex-1">
              <p className="text-[12px] font-medium text-ink">{toast.title}</p>
              {toast.description ? (
                <p className="mt-0.5 break-words text-[11px] leading-relaxed text-muted">{toast.description}</p>
              ) : null}
            </div>
            <button
              type="button"
              aria-label="关闭通知"
              onClick={() => dismiss(toast.id)}
              className="cursor-pointer rounded p-0.5 text-faint transition-colors hover:text-ink focus-ring"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
