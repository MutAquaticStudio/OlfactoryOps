/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['Fraunces', 'serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      colors: {
        lab: {
          bg: '#050507',
          blue: '#4d9bff',
          gold: '#c4a86a',
          green: '#37d6a0',
          amber: '#f5b04c',
          red: '#f2585f',
        },
      },
    },
  },
  plugins: [],
}
