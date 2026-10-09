/** @type {import('tailwindcss').Config} */
// Tokens del MedioGol Design System (valores en src/index.css, :root)
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        mg: {
          bg: 'var(--mg-surface-000)',
          surface: 'var(--mg-surface-100)',
          'surface-2': 'var(--mg-surface-200)',
          line: 'var(--mg-line)',
          'line-strong': 'var(--mg-line-strong)',
          ink: 'var(--mg-ink)',
          muted: 'var(--mg-ink-muted)',
          navy: 'var(--mg-navy)',
          'on-navy': 'var(--mg-on-navy)',
          'on-navy-muted': 'var(--mg-on-navy-muted)',
          pitch: 'var(--mg-pitch)',
          'on-pitch': 'var(--mg-on-pitch)',
          'pitch-deep': 'var(--mg-pitch-deep)',
          'pitch-tint': 'var(--mg-pitch-tint)',
          lime: 'var(--mg-lime)',
          gold: 'var(--mg-gold)',
          'on-gold': 'var(--mg-on-gold)',
          'gold-ink': 'var(--mg-gold-ink)',
          flame: 'var(--mg-flame)',
          danger: 'var(--mg-danger)',
          'danger-tint': 'var(--mg-danger-tint)',
          focus: 'var(--mg-focus)',
        },
      },
      fontFamily: {
        sans: ['Manrope', 'system-ui', 'sans-serif'],
        display: ['"Barlow Condensed"', '"Arial Narrow"', 'sans-serif'],
      },
      borderRadius: {
        'mg-sm': '6px',
        'mg-md': '10px',
        'mg-lg': '16px',
      },
      boxShadow: {
        'mg-card': '0 1px 2px rgba(12,26,46,0.06), 0 6px 20px rgba(12,26,46,0.06)',
      },
    },
  },
  plugins: [],
};
