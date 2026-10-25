import React from 'react'
import type { JSX } from 'react'
import { ChevronDown, Loader2 } from 'lucide-react'
import { cn } from '@/lib/format'

export function Panel({
  className,
  children,
  ...rest
}: React.HTMLAttributes<HTMLDivElement>): JSX.Element {
  return (
    <div className={cn('panel', className)} {...rest}>
      {children}
    </div>
  )
}

export function SectionHeader({
  title,
  subtitle,
  action,
  className
}: {
  title: string
  subtitle?: string
  action?: React.ReactNode
  className?: string
}): JSX.Element {
  return (
    <div className={cn('flex items-start justify-between gap-4', className)}>
      <div>
        <h2 className="text-[13px] font-semibold tracking-wide text-ink">{title}</h2>
        {subtitle ? <p className="mt-1 text-[11.5px] text-muted">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  )
}

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
type ButtonSize = 'sm' | 'md' | 'lg'

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-accent text-white border border-white/10 shadow-[0_10px_28px_-14px_rgba(124,108,255,0.85)] hover:bg-accent/90 active:bg-accent/80',
  secondary:
    'border border-line/10 bg-line/[0.05] text-ink hover:bg-line/[0.09] active:bg-line/[0.12]',
  ghost: 'text-muted hover:text-ink hover:bg-line/[0.06] border border-transparent',
  danger: 'border border-danger/30 bg-danger/10 text-danger hover:bg-danger/[0.16]'
}

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-[12px] gap-1.5 rounded-lg',
  md: 'h-9 px-4 text-[12.5px] gap-2 rounded-[10px]',
  lg: 'h-11 px-5 text-[13px] gap-2 rounded-xl'
}

export function Button({
  variant = 'secondary',
  size = 'md',
  loading,
  className,
  children,
  disabled,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
}): JSX.Element {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={cn(
        'inline-flex cursor-pointer select-none items-center justify-center whitespace-nowrap font-medium transition-colors duration-150 focus-ring disabled:cursor-not-allowed disabled:opacity-50',
        BUTTON_VARIANTS[variant],
        BUTTON_SIZES[size],
        className
      )}
      {...rest}
    >
      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
      {children}
    </button>
  )
}

export function IconButton({
  className,
  label,
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }): JSX.Element {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-transparent text-muted transition-colors hover:bg-line/[0.07] hover:text-ink focus-ring',
        className
      )}
      {...rest}
    >
      {children}
    </button>
  )
}

type BadgeTone = 'neutral' | 'accent' | 'mint' | 'warn' | 'danger'

const BADGE_TONES: Record<BadgeTone, string> = {
  neutral: 'border-line/10 bg-line/[0.05] text-muted',
  accent: 'border-accent/25 bg-accent/10 text-accent',
  mint: 'border-mint/25 bg-mint/10 text-mint',
  warn: 'border-warn/25 bg-warn/10 text-warn',
  danger: 'border-danger/25 bg-danger/10 text-danger'
}

export function Badge({
  tone = 'neutral',
  className,
  children
}: {
  tone?: BadgeTone
  className?: string
  children: React.ReactNode
}): JSX.Element {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10.5px] font-medium leading-none',
        BADGE_TONES[tone],
        className
      )}
    >
      {children}
    </span>
  )
}

export function Toggle({
  checked,
  onChange,
  label,
  disabled
}: {
  checked: boolean
  onChange: (value: boolean) => void
  label: string
  disabled?: boolean
}): JSX.Element {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative h-6 w-10 shrink-0 cursor-pointer rounded-full border transition-colors duration-200 focus-ring disabled:opacity-40',
        checked ? 'border-accent/50 bg-accent/80' : 'border-line/10 bg-line/[0.08] hover:bg-line/[0.12]'
      )}
    >
      <span
        className={cn(
          'absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full bg-white shadow transition-all duration-200',
          checked ? 'left-[calc(100%-18px)]' : 'left-[3px]'
        )}
      />
    </button>
  )
}

export function Field({
  label,
  hint,
  htmlFor,
  children,
  className
}: {
  label: string
  hint?: string
  htmlFor?: string
  children: React.ReactNode
  className?: string
}): JSX.Element {
  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={htmlFor} className="block text-[12px] font-medium text-ink">
        {label}
      </label>
      {children}
      {hint ? <p className="text-[11px] leading-relaxed text-faint">{hint}</p> : null}
    </div>
  )
}

export const inputClass =
  'h-9 w-full rounded-[10px] border border-line/10 bg-canvas/60 px-3 text-[12.5px] text-ink placeholder:text-faint outline-none transition-colors focus:border-accent/50 focus:ring-2 focus:ring-accent/20'

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>): JSX.Element {
  return <input {...props} className={cn(inputClass, props.className)} />
}

export function Select({
  className,
  children,
  ...rest
}: React.SelectHTMLAttributes<HTMLSelectElement>): JSX.Element {
  return (
    <div className={cn('relative', className)}>
      <select
        {...rest}
        className="h-9 w-full cursor-pointer appearance-none rounded-[10px] border border-line/10 bg-canvas/60 px-3 pr-8 text-[12.5px] text-ink outline-none transition-colors focus:border-accent/50 focus:ring-2 focus:ring-accent/20"
      >
        {children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint"
        aria-hidden
      />
    </div>
  )
}

export function ProgressBar({
  value,
  className,
  tone = 'accent'
}: {
  value: number
  className?: string
  tone?: 'accent' | 'mint'
}): JSX.Element {
  const clamped = Math.max(0, Math.min(100, value))
  return (
    <div className={cn('h-1 w-full overflow-hidden rounded-full bg-line/[0.08]', className)}>
      <div
        className={cn(
          'h-full rounded-full transition-[width] duration-300 ease-out',
          tone === 'mint' ? 'bg-mint' : 'bg-accent'
        )}
        style={{ width: `${clamped}%` }}
      />
    </div>
  )
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className
}: {
  icon: React.ReactNode
  title: string
  description: string
  action?: React.ReactNode
  className?: string
}): JSX.Element {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-12 text-center', className)}>
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-line/10 bg-line/[0.04] text-muted">
        {icon}
      </div>
      <h3 className="text-[13.5px] font-semibold text-ink">{title}</h3>
      <p className="mt-1.5 max-w-sm text-[12px] leading-relaxed text-muted">{description}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  )
}

export function StatTile({
  label,
  value,
  hint,
  icon,
  tone = 'default'
}: {
  label: string
  value: React.ReactNode
  hint?: React.ReactNode
  icon?: React.ReactNode
  tone?: 'default' | 'accent' | 'mint' | 'warn'
}): JSX.Element {
  const toneClass =
    tone === 'accent'
      ? 'text-accent'
      : tone === 'mint'
        ? 'text-mint'
        : tone === 'warn'
          ? 'text-warn'
          : 'text-ink'
  return (
    <Panel className="p-4">
      <div className="flex items-center justify-between">
        <span className="text-[11.5px] font-medium text-muted">{label}</span>
        {icon ? <span className="text-faint">{icon}</span> : null}
      </div>
      <div className={cn('mono mt-2.5 text-[22px] font-medium leading-none', toneClass)}>{value}</div>
      {hint ? <div className="mt-2 text-[11px] text-faint">{hint}</div> : null}
    </Panel>
  )
}

export function Dot({
  tone = 'mint',
  pulse = false
}: {
  tone?: 'mint' | 'warn' | 'danger' | 'muted'
  pulse?: boolean
}): JSX.Element {
  const color =
    tone === 'mint'
      ? 'bg-mint'
      : tone === 'warn'
        ? 'bg-warn'
        : tone === 'danger'
          ? 'bg-danger'
          : 'bg-muted'
  return (
    <span className="relative flex h-1.5 w-1.5">
      {pulse ? (
        <span className={cn('absolute inline-flex h-full w-full animate-ping rounded-full opacity-60', color)} />
      ) : null}
      <span className={cn('relative inline-flex h-1.5 w-1.5 rounded-full', color)} />
    </span>
  )
}
