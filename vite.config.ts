/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const v2E2eApiProxy = process.env.V2_E2E_API_PROXY?.trim()

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: v2E2eApiProxy ? { proxy: { '/api': { target: v2E2eApiProxy, changeOrigin: true, secure: false } } } : undefined,
  preview: v2E2eApiProxy ? { proxy: { '/api': { target: v2E2eApiProxy, changeOrigin: true, secure: false } } } : undefined,
  test: {
    exclude: ['**/node_modules/**', '**/dist/**', '**/archive/**'],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/recharts')) return 'charts'
          if (id.includes('node_modules/lucide-react')) return 'icons'
          if (id.includes('node_modules/framer-motion')) return 'motion'
          if (id.includes('node_modules/qrcode')) return 'qrcode'
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) {
            return 'react'
          }
          if (id.includes('node_modules')) {
            return 'vendor'
          }
        },
      },
    },
  },
})
