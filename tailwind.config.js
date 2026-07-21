/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef4ff',
          100: '#d9e6ff',
          200: '#bcd3ff',
          300: '#8eb6ff',
          400: '#598eff',
          500: '#3366f2',
          600: '#204ad6',
          700: '#1b3bad',
          800: '#1c358a',
          900: '#1c3070',
        },
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
    },
  },
  plugins: [],
}
