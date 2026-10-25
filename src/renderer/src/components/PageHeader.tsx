import type { JSX } from 'react'

export function PageHeader({
  title,
  subtitle,
  children
}: {
  title: string
  subtitle?: string
  children?: React.ReactNode
}): JSX.Element {
  return (
    <div className="flex items-end justify-between gap-4 px-7 pb-5 pt-6">
      <div>
        <h1 className="text-[19px] font-semibold tracking-tight text-ink">{title}</h1>
        {subtitle ? <p className="mt-1 text-[12px] text-muted">{subtitle}</p> : null}
      </div>
      {children ? <div className="flex items-center gap-2">{children}</div> : null}
    </div>
  )
}
