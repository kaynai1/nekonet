/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: 'rgb(var(--canvas) / <alpha-value>)',
        surface: 'rgb(var(--surface) / <alpha-value>)',
        elevated: 'rgb(var(--elevated) / <alpha-value>)',
        line: 'rgb(var(--line) / <alpha-value>)',
        ink: 'rgb(var(--ink) / <alpha-value>)',
        muted: 'rgb(var(--muted) / <alpha-value>)',
        faint: 'rgb(var(--faint) / <alpha-value>)',
        accent: 'rgb(var(--accent) / <alpha-value>)',
        mint: 'rgb(var(--mint) / <alpha-value>)',
        warn: 'rgb(var(--warn) / <alpha-value>)',
        danger: 'rgb(var(--danger) / <alpha-value>)',
        tone: {
          violet: 'rgb(var(--accent) / <alpha-value>)',
          sky: 'rgb(var(--tone-sky) / <alpha-value>)',
          mint: 'rgb(var(--mint) / <alpha-value>)',
          amber: 'rgb(var(--warn) / <alpha-value>)',
          rose: 'rgb(var(--tone-rose) / <alpha-value>)'
        }
      },
      fontFamily: {
        sans: ['Inter', 'Noto Sans SC', 'Microsoft YaHei', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Cascadia Code', 'Consolas', 'monospace']
      },
      borderRadius: {
        xl: '14px',
        '2xl': '18px',
        '3xl': '24px'
      },
      boxShadow: {
        panel: '0 1px 0 0 rgb(255 255 255 / 0.04) inset, 0 20px 50px -30px rgb(0 0 0 / 0.9)',
        glow: '0 0 0 1px rgb(var(--accent) / 0.35), 0 12px 40px -12px rgb(var(--accent) / 0.55)'
      },
      keyframes: {
        'sweep': {
          from: { transform: 'rotate(0deg)' },
          to: { transform: 'rotate(360deg)' }
        },
        'pulse-ring': {
          '0%': { transform: 'scale(0.6)', opacity: '0.7' },
          '100%': { transform: 'scale(1.6)', opacity: '0' }
        },
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'translateY(0)' }
        },
        'shimmer': {
          '100%': { transform: 'translateX(100%)' }
        }
      },
      animation: {
        sweep: 'sweep 4.8s linear infinite',
        'pulse-ring': 'pulse-ring 2.4s ease-out infinite',
        'fade-up': 'fade-up 320ms cubic-bezier(0.2, 0.8, 0.2, 1) both',
        shimmer: 'shimmer 1.8s infinite'
      }
    }
  },
  plugins: []
}
