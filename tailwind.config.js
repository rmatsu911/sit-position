/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        sysken: {
          50: '#e9f2fa',
          100: '#cfe1f3',
          200: '#a3c6e6',
          300: '#6ba4d6',
          400: '#3a82c4',
          500: '#005bac', // メインブルー
          600: '#0b4f92',
          700: '#164a7b', // ダークブルー
          800: '#153c62',
          900: '#122f4c',
        },
        ink: {
          DEFAULT: '#1f2933',
          soft: '#667085',
        },
        line: '#d6dce3',
        canvas: '#f4f6f8',
        ok: '#2e8b57',
        warn: '#e6a700',
        ng: '#d64545',
      },
      fontFamily: {
        sans: [
          '"Segoe UI"',
          '"Yu Gothic UI"',
          '"Meiryo"',
          '"Hiragino Kaku Gothic ProN"',
          'sans-serif',
        ],
      },
      boxShadow: {
        panel: '0 1px 2px rgba(31,41,51,0.06), 0 1px 3px rgba(31,41,51,0.04)',
        pop: '0 4px 16px rgba(31,41,51,0.14)',
      },
      borderRadius: {
        DEFAULT: '4px',
      },
    },
  },
  plugins: [],
}
