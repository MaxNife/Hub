import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Hub shell: dev proxies /api + /apps to the Go server on :8080.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:8080',
      // Trailing slash: /apps itself is a client route (All apps page).
      '/apps/': 'http://127.0.0.1:8080',
      '/healthz': 'http://127.0.0.1:8080',
    },
  },
})
