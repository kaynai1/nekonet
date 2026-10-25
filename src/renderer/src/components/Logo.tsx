import type { JSX } from 'react'
import { cn } from '@/lib/format'

export function Logo({ className }: { className?: string }): JSX.Element {
  return (
    <svg viewBox="0 0 32 32" className={cn('h-6 w-6', className)} aria-hidden>
      <defs>
        <linearGradient id="logoStroke" x1="4" y1="4" x2="28" y2="28" gradientUnits="userSpaceOnUse">
          <stop stopColor="rgb(124,108,255)" />
          <stop offset="1" stopColor="rgb(45,212,191)" />
        </linearGradient>
      </defs>
      <path
        d="M16 2.8 27.4 9.2v13.6L16 29.2 4.6 22.8V9.2Z"
        fill="rgb(124,108,255)"
        fillOpacity="0.10"
        stroke="url(#logoStroke)"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      <path
        d="M16 11.4a4.6 4.6 0 0 1 4.6 4.6"
        fill="none"
        stroke="rgb(45,212,191)"
        strokeWidth="1.4"
        strokeLinecap="round"
        opacity="0.9"
      />
      <path
        d="M16 8a8 8 0 0 1 8 8"
        fill="none"
        stroke="rgb(45,212,191)"
        strokeWidth="1.3"
        strokeLinecap="round"
        opacity="0.55"
      />
      <circle cx="16" cy="16" r="1.9" fill="rgb(124,108,255)" />
    </svg>
  )
}
