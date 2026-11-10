import type { Config } from 'tailwindcss';

const token = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        bg: token('bg'),
        surface: token('surface'),
        'surface-2': token('surface-2'),
        border: token('border'),
        text: token('text'),
        muted: token('muted'),
        primary: token('primary'),
        accent: token('accent'),
        gold: token('gold'),
        success: token('success'),
        danger: token('danger'),
      },
      fontFamily: {
        display: ['"Space Grotesk"', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        card: '16px',
        btn: '12px',
      },
      backgroundImage: {
        signature: 'linear-gradient(135deg, #7C5CFF 0%, #FF4D8D 55%, #FFB547 100%)',
      },
      boxShadow: {
        glow: '0 0 0 1px rgb(var(--primary) / 0.35), 0 12px 40px -12px rgb(var(--primary) / 0.55)',
        card: '0 1px 0 0 rgb(255 255 255 / 0.04) inset, 0 20px 50px -24px rgb(0 0 0 / 0.6)',
      },
      keyframes: {
        drift: {
          '0%, 100%': { transform: 'translate(0, 0) scale(1)' },
          '33%': { transform: 'translate(6%, -4%) scale(1.08)' },
          '66%': { transform: 'translate(-5%, 5%) scale(0.95)' },
        },
        shimmer: { '100%': { transform: 'translateX(100%)' } },
        'page-in': { from: { opacity: '0', transform: 'translateY(10px)' }, to: { opacity: '1', transform: 'none' } },
        'pulse-red': {
          '0%, 100%': { color: 'rgb(var(--danger))', transform: 'scale(1)' },
          '50%': { color: 'rgb(var(--accent))', transform: 'scale(1.06)' },
        },
      },
      animation: {
        drift: 'drift 18s ease-in-out infinite',
        'drift-slow': 'drift 26s ease-in-out infinite reverse',
        shimmer: 'shimmer 1.6s infinite',
        'page-in': 'page-in 0.24s ease-out backwards',
        'pulse-red': 'pulse-red 1s ease-in-out infinite',
      },
    },
  },
  plugins: [],
} satisfies Config;
