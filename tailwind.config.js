/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['Segoe UI Variable', 'Aptos Display', 'Helvetica Neue', 'Arial', 'sans-serif'],
        sans: ['Segoe UI Variable', 'Aptos', 'Helvetica Neue', 'Arial', 'sans-serif'],
        mono: ['Cascadia Mono', 'SFMono-Regular', 'Consolas', 'ui-monospace', 'monospace'],
      },
      colors: {
        lab: {
          bg: '#eef2f3',
          blue: '#0f766e',
          gold: '#9a6700',
          green: '#15803d',
          amber: '#b45309',
          red: '#b42318',
        },
      },
    },
  },
  plugins: [],
}
