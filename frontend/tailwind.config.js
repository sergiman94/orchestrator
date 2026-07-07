/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#0b0d13',
        secondary: '#12141c',
        card: '#181a24',
        elevated: '#1e2030',
        'input-bg': '#141620',
        border: '#2a2d3a',
        'border-light': '#363950',
        'text-primary': '#e2e4ed',
        'text-secondary': '#9498b0',
        'text-muted': '#6b6f85',
        accent: '#6366f1',
        'accent-hover': '#818cf8',
        'accent-dim': 'rgba(99, 102, 241, 0.15)',
        success: '#22c55e',
        'success-dim': 'rgba(34, 197, 94, 0.15)',
        danger: '#ef4444',
        'danger-dim': 'rgba(239, 68, 68, 0.15)',
        warning: '#f59e0b',
        'warning-dim': 'rgba(245, 158, 11, 0.15)',
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'Cascadia Code', 'monospace'],
      },
      borderRadius: {
        DEFAULT: '10px',
        sm: '6px',
      },
      animation: {
        'pulse-glow': 'pulseGlow 1.5s ease-in-out infinite',
        'float': 'emptyStateFloat 3s ease-in-out infinite',
        'spin': 'spin 0.6s linear infinite',
      },
      keyframes: {
        pulseGlow: {
          '0%, 100%': { boxShadow: '0 0 4px var(--tw-shadow-color)', opacity: '1' },
          '50%': { boxShadow: '0 0 12px var(--tw-shadow-color)', opacity: '0.7' },
        },
        emptyStateFloat: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-6px)' },
        },
      },
    },
  },
  plugins: [],
};
